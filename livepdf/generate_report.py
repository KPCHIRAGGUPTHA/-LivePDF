import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, Preformatted
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

def create_pdf(filename="design_patterns_report.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        rightMargin=54, leftMargin=54,
        topMargin=54, bottomMargin=54
    )

    styles = getSampleStyleSheet()
    
    # Custom Styles for clean human look
    title_style = ParagraphStyle(
        name='TitleStyle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor('#1a1a1a'),
        alignment=TA_CENTER
    )
    
    subtitle_style = ParagraphStyle(
        name='SubtitleStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#666666'),
        alignment=TA_CENTER
    )
    
    h1_style = ParagraphStyle(
        name='H1Style',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#2c3e50'),
        spaceBefore=15,
        spaceAfter=8,
        keepWithNext=True
    )
    
    h2_style = ParagraphStyle(
        name='H2Style',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=colors.HexColor('#34495e'),
        spaceBefore=10,
        spaceAfter=5,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        name='BodyStyle',
        parent=styles['BodyText'],
        fontName='Times-Roman',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#333333'),
        spaceAfter=8
    )

    code_style = ParagraphStyle(
        name='CodeStyle',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor('#2c3e50'),
        backColor=colors.HexColor('#f8f9fa'),
        borderColor=colors.HexColor('#eaeded'),
        borderWidth=1,
        borderPadding=6,
        spaceAfter=10
    )

    story = []

    # Title Page
    story.append(Spacer(1, 100))
    story.append(Paragraph("LivePDF Architecture Refactoring", title_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("Practical Integration of GoF Design Patterns for Enterprise Optimization", subtitle_style))
    story.append(Spacer(1, 40))
    
    # Author Block
    info_data = [
        [Paragraph("<b>Author:</b> KPCHIRAGGUPTHA", subtitle_style)],
        [Paragraph("<b>Email:</b> chiragkpguptha@gmail.com", subtitle_style)],
        [Paragraph("<b>Date:</b> August 4, 2026", subtitle_style)],
        [Paragraph("<b>Course:</b> Software Design Patterns & Architectures", subtitle_style)]
    ]
    t = Table(info_data, colWidths=[350])
    t.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t)
    
    story.append(PageBreak())

    # Section 1: Executive Summary
    story.append(Paragraph("Executive Summary", h1_style))
    story.append(Paragraph(
        "This report documents the architectural refactoring of <b>LivePDF</b>—a collaborative version-control and AI document parsing application. To address concerns regarding resource optimization, financial overhead (unnecessary API calls to Google Gemini), and tight routing controller coupling, three classic Gang of Four (GoF) design patterns were integrated into the Node.js Express server: the <b>Factory Method</b> pattern, the <b>Decorator</b> pattern, and the <b>Observer</b> pattern. "
        "The refactoring was completed in a fully backward-compatible manner without altering database schemas or API contracts, resulting in improved latency, fault isolation, and clean code division.",
        body_style
    ))
    story.append(Spacer(1, 15))

    # Section 2: Design Patterns
    
    # 2.1 Factory Method Pattern
    story.append(Paragraph("1. Creational: Factory Method Pattern", h1_style))
    story.append(Paragraph(
        "<b>Description:</b> The Factory Method pattern defines an interface for creating objects, but lets subclasses decide which class to instantiate. "
        "In LivePDF, the AI services layer was tightly coupled with Google GenAI SDK. We introduced a common <code>AIEngine</code> interface and constructed concrete implementations for <code>GeminiAIEngine</code> (production) and <code>MockAIEngine</code> (local test fallback). "
        "The <code>AIEngineFactory</code> dynamically creates the decorated client depending on the availability of configuration keys.",
        body_style
    ))
    
    # Text-based Class Diagram
    diagram_factory = """
+--------------------------------------------------+
|                  AIEngine                        |  <-- Interface/Base
+--------------------------------------------------+
| + generateChangeSummary(diffId, changes, title)   |
| + classifyChanges(changes)                       |
+--------------------------------------------------+
                         ^
                         | (extends)
         +---------------+---------------+
         |                               |
+--------------------+          +--------------------+
|   GeminiAIEngine   |          |    MockAIEngine    |
+--------------------+          +--------------------+
| - GoogleGenAI SDK  |          | - Rule-based logic |
+--------------------+          +--------------------+
    """
    story.append(Paragraph("Class Diagram Representation:", h2_style))
    story.append(Preformatted(diagram_factory, code_style))
    
    story.append(Paragraph("Implementation File Path: <code>server/src/services/ai/AIEngineFactory.js</code> (Lines 1-25)", h2_style))
    
    code_factory = """const GeminiAIEngine = require('./GeminiAIEngine');
const MockAIEngine = require('./MockAIEngine');
const CachingAIEngineDecorator = require('./CachingAIEngineDecorator');

class AIEngineFactory {
  static getEngine() {
    const apiKey = process.env.GEMINI_API_KEY;
    const isMockMode = !apiKey || apiKey.startsWith('your_');

    let baseEngine;
    if (isMockMode) {
      baseEngine = new MockAIEngine();
    } else {
      baseEngine = new GeminiAIEngine();
    }

    // Wrap in the CachingDecorator to transparently cache results
    return new CachingAIEngineDecorator(baseEngine);
  }
}

module.exports = AIEngineFactory;"""
    story.append(Preformatted(code_factory, code_style))
    
    story.append(Paragraph("Interface Delegator File: <code>server/src/services/aiService.js</code> (Lines 1-20)", h2_style))
    code_ai_service = """const AIEngineFactory = require('./ai/AIEngineFactory');

// Create the unified, decorated AI engine instance using the Factory Method
const aiEngine = AIEngineFactory.getEngine();

async function generateChangeSummary(versionDiffId, changes, documentTitle) {
  return aiEngine.generateChangeSummary(versionDiffId, changes, documentTitle);
}

async function classifyChanges(changes) {
  return aiEngine.classifyChanges(changes);
}

module.exports = { generateChangeSummary, classifyChanges };"""
    story.append(Preformatted(code_ai_service, code_style))
    story.append(PageBreak())

    # 2.2 Decorator Pattern
    story.append(Paragraph("2. Structural: Decorator Pattern", h1_style))
    story.append(Paragraph(
        "<b>Description:</b> The Decorator pattern attaches new behaviors to objects dynamically by wrapping them inside a structural class that maintains the same interface. "
        "We wrapped our base <code>AIEngine</code> inside a <code>CachingAIEngineDecorator</code>. The decorator intercepts call executions to check the database cache (<code>ai_summaries</code> table) first. If cached, it immediately serves the response, saving Gemini API network transactions.",
        body_style
    ))
    
    diagram_decorator = """
+--------------------------------------------------+
|            CachingAIEngineDecorator              |  <-- Implements AIEngine
+--------------------------------------------------+
| - baseEngine: AIEngine                           |  <-- Wraps component
+--------------------------------------------------+
| + generateChangeSummary(...)                     |  <-- Intercepts and caches
|    1. Check database ai_summaries cache          |
|    2. If miss -> call baseEngine.generate...     |
|    3. Save results in DB & return                |
+--------------------------------------------------+
    """
    story.append(Paragraph("Decorator Pipeline Diagram:", h2_style))
    story.append(Preformatted(diagram_decorator, code_style))
    
    story.append(Paragraph("Implementation File Path: <code>server/src/services/ai/CachingAIEngineDecorator.js</code> (Lines 13-64)", h2_style))
    
    code_decorator = """  async generateChangeSummary(versionDiffId, changes, documentTitle) {
    // 1. Check PostgreSQL database cache first
    try {
      const cached = await pool.query(
        'SELECT summary_text FROM ai_summaries WHERE version_diff_id = $1',
        [versionDiffId]
      );
      if (cached.rows.length > 0) {
        return cached.rows[0].summary_text;
      }
    } catch (dbErr) {
      console.error('[Cache Error] Cache lookup failed:', dbErr.message);
    }

    // 2. Cache miss: Delegate to underlying base engine
    const result = await this.baseEngine.generateChangeSummary(versionDiffId, changes, documentTitle);

    let summaryText = result.text || result;

    // 3. Cache the summary result in PostgreSQL for future requests
    if (summaryText && !summaryText.startsWith('Error:')) {
      try {
        await pool.query(
          `INSERT INTO ai_summaries (version_diff_id, summary_text, model_used, prompt_tokens, completion_tokens)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (version_diff_id) DO NOTHING`,
          [versionDiffId, summaryText, MODEL, result.promptTokens, result.completionTokens]
        );
      } catch (dbErr) {
        console.error('[Cache Error] Failed to write cache:', dbErr.message);
      }
    }
    return summaryText;
  }"""
    story.append(Preformatted(code_decorator, code_style))
    story.append(PageBreak())

    # 2.3 Observer Pattern
    story.append(Paragraph("3. Behavioral: Observer Pattern", h1_style))
    story.append(Paragraph(
        "<b>Description:</b> The Observer pattern defines a subscription model where a subject notifies observers of state alterations. "
        "In the legacy code, <code>documentController.js</code> was heavily coupled with 5 post-upload side effects (Auditing, Email Notifications, Socket Broadcasting, Visual Diffing, and Vector Embeddings). We decoupled these into isolated listeners registered to a central subject <code>documentEventManager</code>.",
        body_style
    ))
    
    diagram_observer = """
+------------------------+      emits      +-------------------------+
|   documentController   | --------------> |  documentEventManager   |
+------------------------+                 +-------------------------+
                                                        |
                                           notifies     | (document:updated)
                                                        v
                                           +-------------------------+
                                           |    documentObservers    |
                                           +-------------------------+
                                           | - AuditLogObserver      |
                                           | - EmailAlertsObserver   |
                                           | - SocketUpdateObserver  |
                                           | - DiffObserver          |
                                           | - EmbeddingObserver     |
                                           +-------------------------+
    """
    story.append(Paragraph("Event-Driven Observer Diagram:", h2_style))
    story.append(Preformatted(diagram_observer, code_style))
    
    story.append(Paragraph("Event-Broker File Path: <code>server/src/services/documentEventManager.js</code> (Lines 1-13)", h2_style))
    code_obs_manager = """const EventEmitter = require('events');

class DocumentEventManager extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20);
  }
}

const documentEventManager = new DocumentEventManager();
module.exports = documentEventManager;"""
    story.append(Preformatted(code_obs_manager, code_style))
    
    story.append(Paragraph("Publisher File Path: <code>server/src/controllers/documentController.js</code> (Lines 223-232)", h2_style))
    code_obs_pub = """    // Emit event to observers to run async upload side-effects
    documentEventManager.emit('document:updated', {
      req,
      userId: req.user.id,
      docId,
      versionId,
      s3Key,
      nextVersion,
      fileBuffer: req.file.buffer
    });"""
    story.append(Preformatted(code_obs_pub, code_style))

    story.append(Paragraph("Observer Registry File Path: <code>server/src/services/observers/documentObservers.js</code> (Lines 1-32)", h2_style))
    code_obs_sub = """const documentEventManager = require('../documentEventManager');
const { logAudit } = require('../../utils/audit');
const { emailQueue } = require('../queueService');
const { emitDocUpdated } = require('../../socket');
const { getFileUrl } = require('../../utils/fileUrl');
const pool = require('../../config/db');

// 1. Audit Log Observer - Records audit trail entries
documentEventManager.on('document:updated', async (data) => {
  const { req, docId, nextVersion } = data;
  try {
    await logAudit(req, docId, 'upload', { versionNumber: nextVersion });
    console.log(`[Observer] AuditLogObserver: Logged upload for doc ${docId}`);
  } catch (err) {
    console.error('[Observer Error] AuditLogObserver failed:', err.message);
  }
});

// 2. Email Alerts Observer - Enqueues background email notifications job
documentEventManager.on('document:updated', async (data) => {
  const { docId, nextVersion, versionId, userId } = data;
  if (nextVersion <= 1) return; // Only notify for new version updates
  try {
    const job = await emailQueue.add('sendEmailAlerts', {
      documentId: docId,
      versionNumber: nextVersion,
      newVersionId: versionId,
      ownerId: userId
    });
    console.log(`[Observer] EmailAlertsObserver: Enqueued alerts job ${job.id}`);
  } catch (err) {
    console.error('[Observer Error] EmailAlertsObserver failed:', err.message);
  }
});"""
    story.append(Preformatted(code_obs_sub, code_style))
    story.append(PageBreak())

    # Section 3: References
    story.append(Paragraph("References", h1_style))
    
    ref_body_style = ParagraphStyle(
        name='RefBodyStyle',
        parent=body_style,
        leftIndent=20,
        firstLineIndent=-20,
        spaceAfter=12
    )

    story.append(Paragraph(
        "Gamma, E., Helm, R., Johnson, R., & Vlissides, J. (1994). "
        "<i>Design Patterns: Elements of Reusable Object-Oriented Software</i>. Addison-Wesley.<br/>"
        "<b>Context:</b> The canonical reference defining the formal structures, classes, and roles "
        "for the Factory Method, Decorator, and Observer design patterns.",
        ref_body_style
    ))
    
    story.append(Paragraph(
        "Freeman, E., Robson, E., Sierra, K., & Bates, B. (2020). "
        "<i>Head First Design Patterns: Building Extensible and Maintainable Object-Oriented Software</i> (2nd ed.). O'Reilly Media.<br/>"
        "<b>Context:</b> Architectural guides explaining dynamic behavior composition (Decorator) "
        "and runtime coupling reduction (Observer).",
        ref_body_style
    ))
    
    story.append(Paragraph(
        "Casciaro, M., & Mammino, L. (2020). "
        "<i>Node.js Design Patterns: Design and implement production-grade Node.js applications using design patterns</i> (3rd ed.). Packt Publishing.<br/>"
        "<b>Context:</b> Demonstrates integration of the Observer pattern using standard Node.js "
        "<code>EventEmitter</code> instances, matching our event broker implementation.",
        ref_body_style
    ))

    story.append(Paragraph(
        "Shvets, A. (2021). <i>Design Patterns: Creational, Structural, and Behavioral</i>. Refactoring.Guru. "
        "<font color='#0066cc'><u>https://refactoring.guru/design-patterns/</u></font><br/>"
        "<b>Context:</b> Code structure definitions and trade-off guides mapping GoF patterns "
        "to JavaScript runtime structures.",
        ref_body_style
    ))

    doc.build(story)
    print("PDF Report generated successfully as 'design_patterns_report.pdf'.")

if __name__ == "__main__":
    create_pdf()
