import { randomUUID } from "node:crypto";
import type { Db } from "./db";
export const subjectsSeed = [
  [
    "statistics",
    "Statistics",
    "STA 101",
    "green",
    "chart",
    "Find the story behind the numbers.",
    "Descriptive statistics",
    "Mean, median & variance",
    "The mean is the sum of observations divided by their count. The median is the middle value in a sorted set. Sample variance uses n − 1 in the denominator to account for estimating the population mean.",
  ],
  [
    "microeconomics",
    "Microeconomics",
    "ECO 102",
    "purple",
    "trend",
    "Understand the choices that shape markets.",
    "Consumer behaviour",
    "Demand & elasticity",
    "Price elasticity of demand measures how quantity demanded responds to a price change. Divide the percentage change in quantity by the percentage change in price. A magnitude greater than 1 means demand is elastic.",
  ],
  [
    "accounting",
    "Financial Accounting",
    "ACC 101",
    "orange",
    "calculator",
    "Make sense of every debit and credit.",
    "The accounting equation",
    "Debits, credits & journals",
    "Assets = Liabilities + Equity. Asset and expense accounts increase with a debit. Liability, equity and revenue accounts increase with a credit. Every journal entry has equal total debits and credits.",
  ],
  [
    "economics",
    "Introduction to Economics",
    "ECO 101",
    "blue",
    "globe",
    "Explore how people use limited resources.",
    "Economic foundations",
    "Scarcity & opportunity cost",
    "Scarcity means resources are limited while wants are unlimited. Opportunity cost is the value of the next best alternative forgone. A movement along a demand curve results from a change in the good’s own price.",
  ],
  [
    "mathematics",
    "Mathematics",
    "MAT 101",
    "rose",
    "function",
    "Build confidence, one solution at a time.",
    "Algebra & calculus",
    "Equations & derivatives",
    "To solve a linear equation, apply the same operation to both sides. For f(x) = xⁿ, the power rule gives f′(x) = nxⁿ⁻¹. Check signs carefully and substitute your answer back into the original equation.",
  ],
];
const questions: [string, string, string[], number, string, string, string][] =
  [
    [
      "statistics",
      "What is the mean of 4, 6, 8, 10 and 12?",
      ["6", "8", "9", "10"],
      1,
      "Add the values: 40. Divide by 5 observations to get 8.",
      "Add all five values before dividing by the number of observations.",
      "Mean & median",
    ],
    [
      "statistics",
      "A sample contains 5 observations. Which denominator belongs in the sample variance formula?",
      ["5", "4", "6", "25"],
      1,
      "Sample variance divides the sum of squared deviations by n − 1. With n = 5, the denominator is 4.",
      "For a sample, use n − 1 rather than n.",
      "Sample variance",
    ],
    [
      "statistics",
      "The values are 3, 7, 8, 12 and 20. What is the median?",
      ["7", "8", "10", "12"],
      1,
      "The values are already sorted. The third (middle) observation is 8.",
      "The median is the middle observation, not the average of all observations.",
      "Mean & median",
    ],
    [
      "statistics",
      "A fair six-sided die is rolled. What is the probability of an even number?",
      ["1/6", "1/3", "1/2", "2/3"],
      2,
      "There are 3 even outcomes (2, 4, 6) out of 6 equally likely outcomes: 3/6 = 1/2.",
      "Count all favourable outcomes, then divide by the total possible outcomes.",
      "Probability",
    ],
    [
      "microeconomics",
      "Price rises by 10% and quantity demanded falls by 20%. What is the magnitude of price elasticity?",
      ["0.5", "1", "2", "10"],
      2,
      "The magnitude is |−20% / 10%| = 2. Demand is elastic.",
      "Divide the percentage change in quantity by the percentage change in price.",
      "Price elasticity",
    ],
    [
      "microeconomics",
      "If demand is price elastic, a small price decrease will usually make total revenue…",
      ["Increase", "Decrease", "Stay the same", "Become zero"],
      0,
      "Quantity demanded rises proportionally more than price falls, so total revenue increases.",
      "Elastic demand means quantity responds more than proportionally to price.",
      "Price elasticity",
    ],
    [
      "microeconomics",
      "At a competitive market equilibrium…",
      [
        "Demand is zero",
        "Quantity demanded equals quantity supplied",
        "Price is always lowest",
        "Supply exceeds demand",
      ],
      1,
      "The equilibrium price clears the market: quantity demanded equals quantity supplied.",
      "Equilibrium compares quantities demanded and supplied at the same price.",
      "Market equilibrium",
    ],
    [
      "microeconomics",
      "For a normal good, an increase in income shifts its demand curve…",
      ["Left", "Right", "Down along the curve", "Nowhere"],
      1,
      "Consumers demand more of a normal good at each price when income increases.",
      "Income changes shift demand; changes in the good’s own price move along the curve.",
      "Demand shifts",
    ],
    [
      "accounting",
      "A business buys equipment for ₦50,000 cash. Which entry is correct?",
      [
        "Debit cash; credit equipment",
        "Debit equipment; credit cash",
        "Debit expense; credit revenue",
        "Debit equity; credit cash",
      ],
      1,
      "Equipment (an asset) increases with a debit; cash (an asset) decreases with a credit.",
      "Identify which asset increases and which asset decreases.",
      "Debit & credit",
    ],
    [
      "accounting",
      "Assets are ₦120,000 and liabilities are ₦45,000. What is equity?",
      ["₦165,000", "₦75,000", "₦45,000", "₦120,000"],
      1,
      "Equity = Assets − Liabilities = ₦120,000 − ₦45,000 = ₦75,000.",
      "Rearrange Assets = Liabilities + Equity.",
      "Accounting equation",
    ],
    [
      "accounting",
      "A business earns ₦8,000 cash for services. Revenue is…",
      ["Debited ₦8,000", "Credited ₦8,000", "Not recorded", "Debited ₦16,000"],
      1,
      "Debit cash ₦8,000 and credit service revenue ₦8,000. Revenue increases with credits.",
      "Revenue increases on the credit side.",
      "Journal entries",
    ],
    [
      "accounting",
      "In a balanced journal entry…",
      [
        "Assets must equal expenses",
        "Total debits equal total credits",
        "Every account increases",
        "Cash must be debited",
      ],
      1,
      "Double-entry bookkeeping requires equal total debit and credit amounts in each entry.",
      "A balanced entry refers to debit and credit totals, not the number of accounts.",
      "Journal entries",
    ],
    [
      "economics",
      "Opportunity cost is…",
      [
        "Every possible alternative",
        "The money spent only",
        "The next best alternative forgone",
        "A cost that cannot be recovered",
      ],
      2,
      "Choosing to study instead of working gives up the benefit of that next best alternative.",
      "Focus on the next best alternative, not all alternatives combined.",
      "Opportunity cost",
    ],
    [
      "economics",
      "Scarcity exists because…",
      [
        "All resources are free",
        "Wants exceed available resources",
        "Governments set prices",
        "Only money is limited",
      ],
      1,
      "Limited resources cannot satisfy every want, so choices are necessary.",
      "Scarcity applies to time and resources as well as money.",
      "Scarcity",
    ],
    [
      "economics",
      "Which is a positive economic statement?",
      [
        "Taxes should be lower",
        "Fairness matters most",
        "A higher price reduces quantity demanded, other things equal",
        "Everyone should save more",
      ],
      2,
      "A positive statement describes a testable relationship. A normative statement makes a value judgment.",
      "Look for a testable claim rather than an opinion about what should happen.",
      "Economic reasoning",
    ],
    [
      "economics",
      "A point inside a production possibilities frontier indicates…",
      [
        "Unattainable production",
        "Full efficiency",
        "Underused resources",
        "Unlimited resources",
      ],
      2,
      "Points inside the frontier are feasible but use resources inefficiently or leave some idle.",
      "The frontier represents efficient use of current resources.",
      "Production possibilities",
    ],
    [
      "mathematics",
      "Solve 3x − 6 = 12.",
      ["x = 2", "x = 4", "x = 6", "x = 8"],
      2,
      "Add 6 to both sides: 3x = 18. Divide by 3: x = 6.",
      "Add 6 to both sides before dividing by 3.",
      "Linear equations",
    ],
    [
      "mathematics",
      "If f(x) = x³, what is f′(x)?",
      ["x²", "3x²", "3x³", "x⁴/4"],
      1,
      "Apply the power rule: multiply by 3 and reduce the exponent by 1.",
      "The power rule changes both the coefficient and the exponent.",
      "Derivatives",
    ],
    [
      "mathematics",
      "Solve 2(x − 3) = 10.",
      ["x = 2", "x = 5", "x = 8", "x = 13"],
      2,
      "Divide by 2: x − 3 = 5. Add 3: x = 8.",
      "Keep the entire bracket together when dividing both sides.",
      "Linear equations",
    ],
    [
      "mathematics",
      "What is the derivative of 4x² + 3x − 7?",
      ["8x + 3", "4x + 3", "8x − 7", "8x² + 3"],
      0,
      "Differentiate each term: 4x² → 8x, 3x → 3, and the constant −7 → 0.",
      "The derivative of a constant is zero.",
      "Derivatives",
    ],
  ];
export async function seed(db: Db) {
  await db.transaction(async (tx) => {
    await tx.exec(`INSERT INTO universities VALUES ('demo-university','Folio University') ON CONFLICT DO NOTHING;
 INSERT INTO faculties VALUES ('business','demo-university','Faculty of Business & Economics') ON CONFLICT DO NOTHING;
 INSERT INTO academic_years VALUES ('year-1','business','Year 1') ON CONFLICT DO NOTHING;
 INSERT INTO semesters VALUES ('semester-1','year-1','Semester 1') ON CONFLICT DO NOTHING;
 INSERT INTO class_groups VALUES ('group-a','semester-1','Economics · Group A') ON CONFLICT DO NOTHING;
 INSERT INTO class_groups VALUES ('demo-group','semester-1','Demo class') ON CONFLICT DO NOTHING;`);
    for (const [i, s] of subjectsSeed.entries()) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1 + i);
      tomorrow.setUTCHours(8 + i, 0, 0, 0);
      await tx.query(
        `INSERT INTO subjects(id,semester_id,name,code,color,icon,description,next_class,room) VALUES ($1,'semester-1',$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [
          s[0],
          s[1],
          s[2],
          s[3],
          s[4],
          s[5],
          tomorrow.toISOString(),
          i === 0 ? "Room B204" : "Room A10" + i,
        ],
      );
      await tx.query(
        `INSERT INTO chapters VALUES ($1,$2,$3,1) ON CONFLICT DO NOTHING`,
        [s[0] + "-chapter", s[0], s[6]],
      );
      await tx.query(
        `INSERT INTO lessons VALUES ($1,$2,$3,$4,1) ON CONFLICT DO NOTHING`,
        [s[0] + "-lesson", s[0] + "-chapter", s[7], s[8]],
      );
    }
    const counts: Record<string, number> = {};
    for (const q of questions) {
      const n = (counts[q[0]] = (counts[q[0]] || 0) + 1);
      const s = subjectsSeed.find((s) => s[0] === q[0])!;
      await tx.query(
        `INSERT INTO questions(id,lesson_id,prompt,options,answer,explanation,mistake,topic,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [
          q[0] + "-" + n,
          q[0] + "-lesson",
          q[1],
          JSON.stringify(q[2]),
          q[3],
          q[4],
          q[5],
          q[6],
          s[8],
        ],
      );
    }
    await tx.query(
      `INSERT INTO resources(id,lesson_id,title,storage_key,kind) VALUES ('accounting-td3','accounting-lesson','Accounting · Tutorial sheet 3','accounting-td3','worksheet') ON CONFLICT DO NOTHING`,
    );
    const tasks = [
      [
        "homework-stats",
        "statistics",
        "Finish your statistics exercises",
        "Two short exercises on mean and sample variance.",
        "HOMEWORK",
        1,
        3,
        null,
      ],
      [
        "print-accounting",
        "accounting",
        "Print Accounting TD 3",
        "Bring a printed copy of the tutorial sheet to your next class.",
        "PRINT",
        2,
        2,
        "accounting-td3",
      ],
      [
        "bring-calculator",
        "statistics",
        "Bring your calculator",
        "A scientific calculator will help with tomorrow’s variance exercises.",
        "BRING",
        1,
        1,
        null,
      ],
      [
        "quiz-micro",
        "microeconomics",
        "Microeconomics quiz",
        "Review price elasticity and market equilibrium.",
        "QUIZ",
        4,
        2,
        null,
      ],
    ];
    // Once real students belong to group-a it is a live class: never add sample
    // reminders to it. Existing rows are left unchanged; the demo class always gets them.
    const liveClass =
      (
        await tx.query(
          "SELECT 1 FROM users WHERE group_id='group-a' AND role='student' AND is_demo=false LIMIT 1",
        )
      ).rows.length > 0;
    for (const t of tasks) {
      const due = new Date();
      due.setDate(due.getDate() + Number(t[5]));
      due.setUTCHours(8, 0, 0, 0);
      if (!liveClass)
        await tx.query(
          `INSERT INTO tasks(id,group_id,subject_id,title,description,type,due_at,importance,attachment) VALUES($1,'group-a',$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
          [t[0], t[1], t[2], t[3], t[4], due.toISOString(), t[6], t[7]],
        );
      await tx.query(
        `INSERT INTO tasks(id,group_id,subject_id,title,description,type,due_at,importance,attachment) VALUES($1,'demo-group',$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        ["demo-" + t[0], t[1], t[2], t[3], t[4], due.toISOString(), t[6], t[7]],
      );
    }
    // Preserve existing demo checklists while isolating them from real classes.
    await tx.exec(`INSERT INTO task_completions(user_id,task_id,completed_at)
      SELECT c.user_id,'demo-'||c.task_id,c.completed_at FROM task_completions c
      JOIN users u ON u.id=c.user_id JOIN tasks t ON t.id='demo-'||c.task_id
      WHERE u.is_demo=true AND u.group_id<>'demo-group' ON CONFLICT DO NOTHING;
      UPDATE users SET group_id='demo-group' WHERE is_demo=true AND group_id<>'demo-group';`);
  });
}
export async function seedDemo(db: Db, id: string) {
  await db.transaction(async (tx) => {
    const session = randomUUID();
    await tx.query(
      `INSERT INTO study_sessions(id,user_id,subject_id,mode,question_ids,position) VALUES($1,$2,'statistics','practice',$3,2)`,
      [
        session,
        id,
        JSON.stringify([
          "statistics-1",
          "statistics-2",
          "statistics-3",
          "statistics-4",
        ]),
      ],
    );
    for (const [q, answer] of [
      ["statistics-1", 1],
      ["statistics-2", 1],
    ] as const)
      await tx.query(
        `INSERT INTO question_attempts(id,user_id,session_id,question_id,selected,correct) VALUES($1,$2,$3,$4,$5,true)`,
        [randomUUID(), id, session, q, answer],
      );
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Lagos",
      }).format(d);
      await tx.query(
        `INSERT INTO study_days VALUES($1,$2) ON CONFLICT DO NOTHING`,
        [id, day],
      );
      await tx.query(
        `INSERT INTO xp_events VALUES($1,$2,$3,'Demo study history',$4,$5) ON CONFLICT DO NOTHING`,
        [randomUUID(), id, "demo-" + i, i === 0 ? 20 : 80, d.toISOString()],
      );
    }
    for (const q of ["statistics-1", "statistics-2"])
      await tx.query(
        `INSERT INTO xp_events(id,user_id,event_key,reason,amount) VALUES($1,$2,$3,'Correct answer',5) ON CONFLICT DO NOTHING`,
        [randomUUID(), id, "question:" + q],
      );
  });
}
