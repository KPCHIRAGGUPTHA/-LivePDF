const pool = require('../config/db');

async function listOrganisations(req, res) {
  const userId = req.user.id;
  try {
    const orgsRes = await pool.query(
      `SELECT o.*, m.role 
       FROM organisations o 
       JOIN organisation_members m ON o.id = m.organisation_id 
       WHERE m.user_id = $1`,
      [userId]
    );
    res.json(orgsRes.rows);
  } catch (error) {
    console.error('List organisations error:', error);
    res.status(500).json({ error: 'Failed to list organizations' });
  }
}

async function createOrganisation(req, res) {
  const { name } = req.body;
  const ownerId = req.user.id;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Organisation name is required' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orgRes = await client.query(
        'INSERT INTO organisations (name, owner_id) VALUES ($1, $2) RETURNING *',
        [name.trim(), ownerId]
      );
      const org = orgRes.rows[0];

      // Add owner as admin member
      await client.query(
        'INSERT INTO organisation_members (organisation_id, user_id, role) VALUES ($1, $2, $3)',
        [org.id, ownerId, 'admin']
      );

      await client.query('COMMIT');
      res.status(201).json(org);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create organisation error:', error);
    res.status(500).json({ error: 'Failed to create organisation' });
  }
}

async function inviteMember(req, res) {
  const { orgId } = req.params;
  const { email, role } = req.body; // role: admin, editor, viewer
  const actorId = req.user.id;

  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Invitee email is required' });
  }

  const targetRole = role || 'viewer';
  if (!['admin', 'editor', 'viewer'].includes(targetRole)) {
    return res.status(400).json({ error: 'Invalid member role specified' });
  }

  try {
    // Check if the actor is an admin of this organization
    const memberCheck = await pool.query(
      'SELECT role FROM organisation_members WHERE organisation_id = $1 AND user_id = $2',
      [orgId, actorId]
    );

    if (memberCheck.rows.length === 0 || memberCheck.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Only organisation admins can invite members' });
    }

    // Check if invitee exists in database
    const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim()]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User with this email not registered yet on LivePDF' });
    }
    const targetUserId = userRes.rows[0].id;

    await pool.query(
      `INSERT INTO organisation_members (organisation_id, user_id, role) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (organisation_id, user_id) DO UPDATE SET role = $3`,
      [orgId, targetUserId, targetRole]
    );

    res.json({ success: true, message: 'Member successfully added to organization.' });
  } catch (error) {
    console.error('Invite member error:', error);
    res.status(500).json({ error: 'Failed to invite member to organization' });
  }
}

async function listMembers(req, res) {
  const { orgId } = req.params;
  const actorId = req.user.id;

  try {
    // Verify actor is a member of the organization
    const membership = await pool.query(
      'SELECT role FROM organisation_members WHERE organisation_id = $1 AND user_id = $2',
      [orgId, actorId]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this organisation' });
    }

    const membersRes = await pool.query(
      `SELECT u.id, u.email, u.full_name, m.role, m.created_at 
       FROM organisation_members m 
       JOIN users u ON m.user_id = u.id 
       WHERE m.organisation_id = $1 
       ORDER BY m.role ASC, u.full_name ASC`,
      [orgId]
    );

    res.json(membersRes.rows);
  } catch (error) {
    console.error('List members error:', error);
    res.status(500).json({ error: 'Failed to retrieve organization members' });
  }
}

async function updateMemberRole(req, res) {
  const { orgId, userId } = req.params;
  const { role } = req.body;
  const actorId = req.user.id;

  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role specified' });
  }

  try {
    // Check if actor is admin
    const actorMembership = await pool.query(
      'SELECT role FROM organisation_members WHERE organisation_id = $1 AND user_id = $2',
      [orgId, actorId]
    );

    if (actorMembership.rows.length === 0 || actorMembership.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can modify member roles' });
    }

    // Update role
    const updateRes = await pool.query(
      'UPDATE organisation_members SET role = $1 WHERE organisation_id = $2 AND user_id = $3 RETURNING *',
      [role, orgId, userId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found in organisation' });
    }

    res.json({ success: true, member: updateRes.rows[0] });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
}

async function removeMember(req, res) {
  const { orgId, userId } = req.params;
  const actorId = req.user.id;

  try {
    // Verify actor is admin (or removing themselves)
    const actorMembership = await pool.query(
      'SELECT role FROM organisation_members WHERE organisation_id = $1 AND user_id = $2',
      [orgId, actorId]
    );

    const isSelfRemove = actorId === userId;
    if (!isSelfRemove && (actorMembership.rows.length === 0 || actorMembership.rows[0].role !== 'admin')) {
      return res.status(403).json({ error: 'Only admins can remove other members' });
    }

    // Verify target is not the organization owner
    const orgRes = await pool.query('SELECT owner_id FROM organisations WHERE id = $1', [orgId]);
    if (orgRes.rows.length > 0 && orgRes.rows[0].owner_id === userId) {
      return res.status(400).json({ error: 'Cannot remove the organisation owner' });
    }

    await pool.query(
      'DELETE FROM organisation_members WHERE organisation_id = $1 AND user_id = $2',
      [orgId, userId]
    );

    res.json({ success: true, message: 'Member removed from organisation' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member from organisation' });
  }
}

module.exports = {
  listOrganisations,
  createOrganisation,
  inviteMember,
  listMembers,
  updateMemberRole,
  removeMember,
};
