require('dotenv').config();
const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const pool = require('./src/config/db');

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

connection.on('error', (err) => {
  console.error('Worker Redis error:', err.message);
});

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const worker = new Worker('emailQueue', async (job) => {
  const { documentId, versionNumber, newVersionId, ownerId } = job.data;
  console.log(`[Worker] Processing job ${job.id} for document ${documentId}, version ${versionNumber}`);

  try {
    // 1. Fetch document title
    const docResult = await pool.query('SELECT title FROM documents WHERE id = $1', [documentId]);
    if (docResult.rows.length === 0) {
      console.error(`[Worker] Document ${documentId} not found.`);
      return;
    }
    const documentTitle = docResult.rows[0].title;

    // 2. Poll for the AI summary up to 10 seconds
    let changeSummary = null;
    for (let i = 0; i < 10; i++) {
      const summaryRes = await pool.query(
        `SELECT summary_text FROM ai_summaries s
         JOIN version_diffs vd ON vd.id = s.version_diff_id
         WHERE vd.document_id = $1 AND vd.new_version_id = $2`,
        [documentId, newVersionId]
      );
      if (summaryRes.rows.length > 0) {
        changeSummary = summaryRes.rows[0].summary_text;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!changeSummary) {
      changeSummary = 'No change summary available for this version.';
    }

    // 3. Find recipients: viewed in the last 7 days, exclude owner, exclude opted-out
    const recipientsResult = await pool.query(
      `SELECT DISTINCT ON (al.user_id) 
         al.user_id, 
         u.email, 
         u.full_name,
         al.metadata->>'token' AS token
       FROM audit_logs al
       JOIN users u ON u.id = al.user_id
       LEFT JOIN notification_preferences np 
         ON np.user_id = al.user_id AND np.document_id = al.document_id
       WHERE al.document_id = $1
         AND al.action = 'view'
         AND al.created_at >= NOW() - INTERVAL '7 days'
         AND al.user_id IS NOT NULL
         AND al.user_id != $2
         AND (np.unsubscribed IS NULL OR np.unsubscribed = FALSE)`,
      [documentId, ownerId]
    );

    const recipients = recipientsResult.rows;
    console.log(`[Worker] Found ${recipients.length} recipients to notify.`);

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const apiURL = process.env.API_URL || 'http://localhost:5000';

    for (const recipient of recipients) {
      // 4. Generate signed unsubscribe token (no expiry, signed with JWT_SECRET)
      const unsubToken = jwt.sign(
        { userId: recipient.user_id, documentId },
        process.env.JWT_SECRET
      );
      const unsubscribeLink = `${apiURL}/api/notifications/unsubscribe?token=${unsubToken}`;
      const viewLink = `${clientUrl}/view/${recipient.token}`;

      const messageText = `New version ${versionNumber} uploaded for "${documentTitle}"`;

      // 5. Insert in-app notification
      await pool.query(
        `INSERT INTO notifications (user_id, document_id, message, metadata)
         VALUES ($1, $2, $3, $4)`,
        [
          recipient.user_id,
          documentId,
          messageText,
          JSON.stringify({ token: recipient.token, versionNumber }),
        ]
      );

      // 6. Send email notification via Nodemailer
      await transporter.sendMail({
        from: `"LivePDF" <${process.env.EMAIL_USER}>`,
        to: recipient.email,
        subject: `[LivePDF] Document Updated: ${documentTitle}`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <!-- Logo Header -->
            <div style="background: #0f172a; padding: 24px; text-align: center;">
              <span style="font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: 1.5px; font-family: 'Outfit', sans-serif;">LivePDF</span>
            </div>
            
            <!-- Content body -->
            <div style="padding: 32px 24px;">
              <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 600; text-align: center;">Document Update Alert</h2>
              <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-bottom: 24px;">
                A new version (<strong>v${versionNumber}</strong>) of the document <strong>"${documentTitle}"</strong> has been uploaded.
              </p>
              
              <!-- AI Change Summary -->
              <div style="background: #f8fafc; border-left: 4px solid #0f172a; padding: 20px; margin: 24px 0; border-radius: 6px;">
                <h4 style="margin: 0 0 10px 0; color: #0f172a; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">AI Change Summary</h4>
                <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${changeSummary}</p>
              </div>

              <!-- Call to Action Button -->
              <div style="text-align: center; margin: 32px 0 16px 0;">
                <a href="${viewLink}" style="background: #0f172a; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px rgba(15, 23, 42, 0.15); transition: background 0.2s;">
                  View Updated PDF
                </a>
              </div>
              
              <!-- Footer with Unsubscribe -->
              <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 40px; border-top: 1px solid #f1f5f9; padding-top: 20px; line-height: 1.5;">
                You are receiving this because you viewed this document recently.<br/>
                Don't want notifications for this document? <a href="${unsubscribeLink}" style="color: #0f172a; font-weight: 600; text-decoration: underline;">Unsubscribe</a>
              </p>
            </div>
          </div>
        `,
      });
      console.log(`[Worker] Sent email and created in-app notification for user ${recipient.user_id} (${recipient.email})`);
    }
  } catch (err) {
    console.error(`[Worker] Failed to process job ${job.id}:`, err);
    throw err; // allow BullMQ to retry the job
  }
}, { connection });

console.log('[Worker] BullMQ email notification worker is active.');
