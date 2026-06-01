/**
 * ════════════════════════════════════════════════════════════════════════
 *  seedCounters.js — One-time migration for Patient 360°
 *  ──────────────────────────────────────────────────────────────────────
 *  Seeds the `counters` collection from existing `children` records so the
 *  new atomic CRN generator continues numbering exactly where the old one
 *  stopped — without colliding with already-issued CRNs.
 *
 *  WHEN TO RUN
 *  ───────────
 *  Run ONCE, immediately after deploying the atomic-counter version of
 *  Children.js + Counter.js. Safe to run multiple times: the script uses
 *  `$max` so re-running can only push counters higher, never lower.
 *
 *  HOW TO RUN
 *  ──────────
 *  Option A — mongosh from terminal (recommended):
 *    mongosh "mongodb://localhost:27017/PATIENT360" --file seedCounters.js
 *
 *  Option B — inside Compass MongoSH tab or mongosh interactive:
 *    use PATIENT360
 *    load('C:/path/to/seedCounters.js')
 *
 *  WHAT IT DOES (step by step)
 *  ───────────────────────────
 *    1. Reads every `children` doc with a valid CRN matching CRN-YYYYMMDD-XXXXX
 *    2. Extracts the date part (YYYYMMDD) and seq part (XXXXX → integer)
 *    3. Groups by date, finds the highest seq for each
 *    4. Upserts `counters` docs using `$max` (idempotent — safe to re-run)
 *
 *  EXAMPLE
 *  ───────
 *  Given these children in the DB:
 *    CRN-20260424-00001
 *    CRN-20260514-00001
 *
 *  After running, the `counters` collection contains:
 *    { _id: "child_20260424", seq: 1 }
 *    { _id: "child_20260514", seq: 1 }
 *
 *  Next child registered on 2026-04-24 → gets CRN-20260424-00002
 *  Next child registered on a new date  → gets CRN-<newdate>-00001 (auto-created)
 * ════════════════════════════════════════════════════════════════════════
 */

(function seedCRNCounters() {
  print('');
  print('═══════════════════════════════════════════════════════════════');
  print('  Patient 360° — CRN Counter Seeding                          ');
  print('═══════════════════════════════════════════════════════════════');
  print('');

  // ── 1. Aggregate existing CRNs to find max seq per date ────────────────
  const pipeline = [
    {
      $match: {
        childRegistrationNumber: { $regex: /^CRN-\d{8}-\d{5}$/ },
      },
    },
    {
      $project: {
        datePart: {
          $arrayElemAt: [{ $split: ['$childRegistrationNumber', '-'] }, 1],
        },
        seqPart: {
          $toInt: {
            $arrayElemAt: [{ $split: ['$childRegistrationNumber', '-'] }, 2],
          },
        },
      },
    },
    {
      $group: {
        _id: '$datePart',
        maxSeq: { $max: '$seqPart' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ];

  const groups = db.children.aggregate(pipeline).toArray();

  if (groups.length === 0) {
    print('  No children with valid CRNs found. Nothing to seed.');
    print('  (The counters collection will auto-populate on first');
    print('   registration via the atomic Counter.next() call.)');
    print('');
    print('═══════════════════════════════════════════════════════════════');
    return;
  }

  print('  Found ' + groups.length + ' unique registration date(s).');
  print('');

  // ── 2. Upsert one counter document per unique date ─────────────────────
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let totalChildren = 0;

  const now = new Date();

  groups.forEach(function processGroup(group) {
    const counterId = 'child_' + group._id;
    totalChildren += group.count;

    const result = db.counters.updateOne(
      { _id: counterId },
      {
        $max: { seq: group.maxSeq },
        $setOnInsert: { createdAt: now },
        $currentDate: { updatedAt: true },
      },
      { upsert: true },
    );

    let status;
    if (result.upsertedCount && result.upsertedCount > 0) {
      status = 'CREATED';
      created += 1;
    } else if (result.modifiedCount && result.modifiedCount > 0) {
      status = 'UPDATED';
      updated += 1;
    } else {
      status = 'unchanged';
      unchanged += 1;
    }

    const childWord = group.count === 1 ? 'child' : 'children';
    print(
      '    [' + status.padEnd(9) + '] '
      + counterId + '  →  seq = ' + group.maxSeq
      + '   (' + group.count + ' ' + childWord + ' on this date)',
    );
  });

  // ── 3. Verification ────────────────────────────────────────────────────
  print('');
  print('  Summary');
  print('  ───────');
  print('    Counters created:     ' + created);
  print('    Counters updated:     ' + updated);
  print('    Counters unchanged:   ' + unchanged);
  print('    Total children scan:  ' + totalChildren);
  print('');

  const childCounterCount = db.counters.countDocuments({
    _id: { $regex: /^child_\d{8}$/ },
  });
  print('  Verification: counters collection now holds '
    + childCounterCount + ' child counter document(s).');
  print('');
  print('═══════════════════════════════════════════════════════════════');
  print('  Seeding complete. Future CRNs use atomic, race-safe        ');
  print('  increments via the counters collection.                    ');
  print('═══════════════════════════════════════════════════════════════');
  print('');
}());
