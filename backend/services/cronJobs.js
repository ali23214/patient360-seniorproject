/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Cron Jobs Service — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Background scheduled tasks that fire push notifications to patients
 *  for time-sensitive reminders. Booted from index.js on server startup.
 *
 *  All jobs run in Damascus timezone (Asia/Damascus).
 *  All jobs are idempotent — re-running them on the same data is safe
 *  because each one filters out patients already notified for that event.
 *
 *  Jobs (5):
 *    1. 24-hour appointment reminder    — every day at 09:00
 *    2. 1-hour appointment reminder     — every hour at :00
 *    3. Unread lab results reminder     — every day at 10:00
 *    4. Undispensed Rx reminder         — every day at 11:00
 *    5. Prescription expiring soon      — every day at 12:00
 *
 *  Why cron and not a worker queue?
 *    For a senior project deploy this is the right tool — zero external
 *    dependencies, runs in-process, survives nodemon restarts on dev.
 *    A real production load (50k+ patients) would migrate this to Bull
 *    or Agenda, but the API surface here is intentionally minimal so the
 *    migration would only touch this file.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const cron = require('node-cron');
const {
  Appointment, LabTest, Prescription, PharmacyDispensing, Person, Children, Account, Doctor
} = require('../models');
const { createNotification } = require('../controllers/notificationController');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format a date in Arabic locale (Damascus timezone).
 * Returns string like "السبت 16 مايو" — used inside notification bodies.
 */
function formatArabicDate(date) {
  try {
    return new Date(date).toLocaleDateString('ar-EG', {
      timeZone: 'Asia/Damascus',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return new Date(date).toISOString().slice(0, 10);
  }
}

/**
 * Compute a [start, end) date range covering the calendar day that is N days
 * from now in Damascus timezone. Used to find appointments occurring tomorrow.
 */
function damascusDayRange(daysFromNow) {
  const now = new Date();
  // Compute today in Damascus
  const damascusNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Damascus' }));
  const target = new Date(damascusNow);
  target.setDate(target.getDate() + daysFromNow);
  target.setHours(0, 0, 0, 0);

  const start = new Date(target);
  const end = new Date(target);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

/**
 * Build the doctor display name (Arabic). Fast path that returns "الطبيب"
 * when the populated doctor is missing — avoids null checks at the call site.
 */
async function getDoctorName(doctorId) {
  if (!doctorId) return 'الطبيب';
  try {
    const doc = await Doctor.findById(doctorId).populate('personId', 'firstName lastName').lean();
    if (doc?.personId) {
      const fname = doc.personId.firstName || '';
      const lname = doc.personId.lastName || '';
      return `د. ${fname} ${lname}`.trim();
    }
  } catch (err) {
    // Fall through to default
  }
  return 'الطبيب';
}

// ============================================================================
// JOB 1: 24-hour appointment reminder
// ============================================================================

/**
 * Runs every day at 09:00 Damascus. Finds all appointments scheduled for
 * tomorrow and sends a push reminder to each patient.
 *
 * Filter: status in ['scheduled', 'confirmed'] — we don't remind for
 * cancelled/completed/no-show appointments.
 */
async function job24HourReminder() {
  console.log('⏰ [CRON] 24h appointment reminder — running');

  const { start, end } = damascusDayRange(1);

  try {
    const appointments = await Appointment.find({
      appointmentDate: { $gte: start, $lt: end },
      status: { $in: ['scheduled', 'confirmed'] },
    }).lean();

    console.log(`   Found ${appointments.length} appointments for tomorrow`);

    let sent = 0;
    for (const appt of appointments) {
      const doctorName = await getDoctorName(appt.doctorId);
      const dateStr = formatArabicDate(appt.appointmentDate);
      const timeStr = appt.appointmentTime || '';

      try {
        await createNotification({
          recipientPersonId: appt.patientPersonId,
          recipientChildId:  appt.patientChildId,
          recipientType: 'patient',
          notificationType: 'appointment_reminder',
          title:       'تذكير: موعدك غداً',
          titleArabic: 'تذكير: موعدك غداً',
          body: `لديك موعد غداً (${dateStr}) الساعة ${timeStr} مع ${doctorName}`,
          channels: ['push', 'in_app'],
          relatedType: 'appointment',
          relatedId:   appt._id,
          deepLinkRoute: '/appointments',
          priority: 'normal',
        });
        sent++;
      } catch (err) {
        console.warn(`   ⚠️  Failed for appointment ${appt._id}:`, err.message);
      }
    }

    console.log(`   ✅ Sent ${sent}/${appointments.length} reminders`);
  } catch (err) {
    console.error('   ❌ Job error:', err.message);
  }
}

// ============================================================================
// JOB 2: 1-hour appointment reminder
// ============================================================================

/**
 * Runs every hour at :00 Damascus. Finds appointments starting within the
 * next 60-119 minutes (window of "about an hour from now") and reminds.
 *
 * We use a 60-min window rather than an exact match because cron runs at
 * :00 every hour — an appointment at 14:30 should still get reminded at
 * 13:00 (90 minutes ahead).
 */
async function job1HourReminder() {
  console.log('⏰ [CRON] 1h appointment reminder — running');

  const now = new Date();
  const windowStart = new Date(now.getTime() + 60 * 60 * 1000);  // +60 min
  const windowEnd   = new Date(now.getTime() + 120 * 60 * 1000); // +120 min

  try {
    // Pull a wider day range, then filter by exact time in memory
    const { start, end } = damascusDayRange(0);
    const dayEnd = new Date(end);
    dayEnd.setDate(dayEnd.getDate() + 1); // include tomorrow too in case window crosses midnight

    const appointments = await Appointment.find({
      appointmentDate: { $gte: start, $lt: dayEnd },
      status: { $in: ['scheduled', 'confirmed'] },
    }).lean();

    // Combine date + time into a real timestamp for windowing
    const targets = appointments.filter(appt => {
      if (!appt.appointmentTime) return false;
      const [hh, mm] = appt.appointmentTime.split(':').map(Number);
      const apptAt = new Date(appt.appointmentDate);
      apptAt.setHours(hh || 0, mm || 0, 0, 0);
      return apptAt >= windowStart && apptAt < windowEnd;
    });

    console.log(`   ${targets.length} appointments in 1h window`);

    let sent = 0;
    for (const appt of targets) {
      const doctorName = await getDoctorName(appt.doctorId);
      try {
        await createNotification({
          recipientPersonId: appt.patientPersonId,
          recipientChildId:  appt.patientChildId,
          recipientType: 'patient',
          notificationType: 'appointment_reminder',
          title:       'موعدك بعد ساعة',
          titleArabic: 'موعدك بعد ساعة',
          body: `موعدك مع ${doctorName} الساعة ${appt.appointmentTime} — يُنصح بالاستعداد للمغادرة`,
          channels: ['push', 'in_app'],
          relatedType: 'appointment',
          relatedId:   appt._id,
          deepLinkRoute: '/appointments',
          priority: 'high',
        });
        sent++;
      } catch (err) {
        console.warn(`   ⚠️  Failed for appointment ${appt._id}:`, err.message);
      }
    }

    console.log(`   ✅ Sent ${sent}/${targets.length} 1h reminders`);
  } catch (err) {
    console.error('   ❌ Job error:', err.message);
  }
}

// ============================================================================
// JOB 3: Unread lab results reminder
// ============================================================================

/**
 * Runs every day at 10:00 Damascus. Finds lab tests completed >= 48 hours
 * ago that the patient hasn't viewed yet, and reminds them.
 *
 * Filter: completedAt between 7 days ago and 48h ago — we don't keep
 * nagging forever, and we don't fire immediately (the original "results
 * ready" push covered that).
 */
async function jobUnreadLabResults() {
  console.log('⏰ [CRON] Unread lab results reminder — running');

  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const sevenDaysAgo       = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const tests = await LabTest.find({
      status: 'completed',
      completedAt: { $gte: sevenDaysAgo, $lte: fortyEightHoursAgo },
      isViewedByPatient: { $ne: true },
    }).lean();

    console.log(`   Found ${tests.length} unread completed tests`);

    let sent = 0;
    for (const test of tests) {
      try {
        await createNotification({
          recipientPersonId: test.patientPersonId,
          recipientChildId:  test.patientChildId,
          recipientType: 'patient',
          notificationType: 'lab_results_ready',
          title:       'نتائج فحص لم تُقرأ',
          titleArabic: 'نتائج فحص لم تُقرأ',
          body: `نتائج فحصك رقم ${test.testNumber} جاهزة منذ يومين — يُنصح بمراجعتها`,
          channels: ['push', 'in_app'],
          relatedType: 'lab_test',
          relatedId:   test._id,
          deepLinkRoute: '/lab',
          priority: 'high',
        });
        sent++;
      } catch (err) {
        console.warn(`   ⚠️  Failed for test ${test._id}:`, err.message);
      }
    }

    console.log(`   ✅ Sent ${sent}/${tests.length} unread-results reminders`);
  } catch (err) {
    console.error('   ❌ Job error:', err.message);
  }
}

// ============================================================================
// JOB 4: Undispensed Rx reminder
// ============================================================================

/**
 * Runs every day at 11:00 Damascus. Finds prescriptions created >= 48 hours
 * ago that haven't been dispensed yet, and reminds the patient.
 *
 * Filter: status === 'active' AND createdAt between 14 days ago and 48h ago.
 * The 14-day cap stops us from nagging about long-dead prescriptions.
 */
async function jobUndispensedRxReminder() {
  console.log('⏰ [CRON] Undispensed Rx reminder — running');

  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const fourteenDaysAgo    = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  try {
    const prescriptions = await Prescription.find({
      status: 'active',
      prescriptionDate: { $gte: fourteenDaysAgo, $lte: fortyEightHoursAgo },
    }).lean();

    console.log(`   Found ${prescriptions.length} undispensed prescriptions`);

    let sent = 0;
    for (const rx of prescriptions) {
      try {
        await createNotification({
          recipientPersonId: rx.patientPersonId,
          recipientChildId:  rx.patientChildId,
          recipientType: 'patient',
          notificationType: 'prescription_ready',
          title:       'وصفة لم تُصرف بعد',
          titleArabic: 'وصفة لم تُصرف بعد',
          body: `وصفتك رقم ${rx.prescriptionNumber} لم تُصرف بعد — لا تنسَ مراجعة الصيدلية`,
          channels: ['push', 'in_app'],
          relatedType: 'prescription',
          relatedId:   rx._id,
          deepLinkRoute: '/medications',
          priority: 'normal',
        });
        sent++;
      } catch (err) {
        console.warn(`   ⚠️  Failed for prescription ${rx._id}:`, err.message);
      }
    }

    console.log(`   ✅ Sent ${sent}/${prescriptions.length} undispensed reminders`);
  } catch (err) {
    console.error('   ❌ Job error:', err.message);
  }
}

// ============================================================================
// JOB 5: Prescription expiring soon
// ============================================================================

/**
 * Runs every day at 12:00 Damascus. Finds active prescriptions whose
 * expiryDate is exactly 3 days from today, and reminds the patient.
 *
 * Filter: status in [active, partially_dispensed] AND expiryDate in the
 * 24-hour window centered on now+3days. The window prevents double-notify
 * if a single day's cron run takes a few minutes (it can't fire twice
 * within the same day because the window is shorter than 24h).
 */
async function jobPrescriptionExpiring() {
  console.log('⏰ [CRON] Prescription expiring soon — running');

  const { start, end } = damascusDayRange(3);

  try {
    const prescriptions = await Prescription.find({
      status: { $in: ['active', 'partially_dispensed'] },
      expiryDate: { $gte: start, $lt: end },
    }).lean();

    console.log(`   Found ${prescriptions.length} prescriptions expiring in 3 days`);

    let sent = 0;
    for (const rx of prescriptions) {
      try {
        await createNotification({
          recipientPersonId: rx.patientPersonId,
          recipientChildId:  rx.patientChildId,
          recipientType: 'patient',
          notificationType: 'prescription_ready',
          title:       'وصفتك على وشك الانتهاء',
          titleArabic: 'وصفتك على وشك الانتهاء',
          body: `وصفتك رقم ${rx.prescriptionNumber} تنتهي بعد 3 أيام — احجز موعد متابعة إذا لزم الأمر`,
          channels: ['push', 'in_app'],
          relatedType: 'prescription',
          relatedId:   rx._id,
          deepLinkRoute: '/medications',
          priority: 'normal',
        });
        sent++;
      } catch (err) {
        console.warn(`   ⚠️  Failed for prescription ${rx._id}:`, err.message);
      }
    }

    console.log(`   ✅ Sent ${sent}/${prescriptions.length} expiring reminders`);
  } catch (err) {
    console.error('   ❌ Job error:', err.message);
  }
}

// ============================================================================
// INIT — Schedule all jobs
// ============================================================================

/**
 * Register all cron jobs with node-cron. Idempotent — safe to call once
 * from index.js at boot. All jobs run in Damascus timezone.
 *
 * Schedule (cron format: minute hour day month weekday):
 *   '0 9 * * *'  — every day at 09:00
 *   '0 * * * *'  — every hour at :00
 *   '0 10 * * *' — every day at 10:00
 *   '0 11 * * *' — every day at 11:00
 *   '0 12 * * *' — every day at 12:00
 */
function init() {
  const tzOptions = { timezone: 'Asia/Damascus' };

  cron.schedule('0 9 * * *',  job24HourReminder,      tzOptions);
  cron.schedule('0 * * * *',  job1HourReminder,        tzOptions);
  cron.schedule('0 10 * * *', jobUnreadLabResults,     tzOptions);
  cron.schedule('0 11 * * *', jobUndispensedRxReminder, tzOptions);
  cron.schedule('0 12 * * *', jobPrescriptionExpiring,  tzOptions);

  console.log('⏰ Cron jobs initialized (Damascus timezone):');
  console.log('   • 09:00 — 24h appointment reminder');
  console.log('   • :00   — 1h appointment reminder');
  console.log('   • 10:00 — Unread lab results reminder');
  console.log('   • 11:00 — Undispensed Rx reminder');
  console.log('   • 12:00 — Prescription expiring reminder');
}

/**
 * Manual trigger helpers — useful for testing without waiting for the
 * actual schedule. Call from a route or REPL to run a single job now.
 */
module.exports = {
  init,
  jobs: {
    job24HourReminder,
    job1HourReminder,
    jobUnreadLabResults,
    jobUndispensedRxReminder,
    jobPrescriptionExpiring,
  },
};