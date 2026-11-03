import { currentStudyPageUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/print-button";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (id !== "accounting-td3") notFound();
  const user = await currentStudyPageUser();
  if (!user) redirect("/sign-in");
  if (
    user.role === "professor" ||
    (user.role !== "admin" &&
      !(
        await (
          await getDb()
        ).query(
          "SELECT 1 FROM tasks WHERE group_id=$1 AND attachment=$2 LIMIT 1",
          [user.group_id, id],
        )
      ).rows.length)
  )
    notFound();
  return (
    <main className="worksheet">
      <div className="worksheet-toolbar">
        <a href="/tasks">← Back to reminders</a>
        <PrintButton />
      </div>
      <header>
        <span className="eyebrow">FOLIO · FINANCIAL ACCOUNTING · ACC 101</span>
        <h1>Tutorial sheet 3</h1>
        <p>The accounting equation & journal entries</p>
      </header>
      <p>
        <strong>Name:</strong> ____________________________{" "}
        <strong>Date:</strong> ______________
      </p>
      <section>
        <h2>1. The accounting equation</h2>
        <p>
          A business has assets of ₦120,000 and liabilities of ₦45,000.
          Calculate its equity and state the equation you used.
        </p>
        <div className="worksheet-lines" />
      </section>
      <section>
        <h2>2. Record the transactions</h2>
        <p>
          Prepare journal entries for each transaction. Identify the account,
          debit and credit.
        </p>
        <ol>
          <li>The owner invests ₦100,000 cash into the business.</li>
          <li>The business purchases equipment for ₦50,000 cash.</li>
          <li>The business receives ₦8,000 cash for services delivered.</li>
          <li>The business pays ₦5,000 rent for the month.</li>
        </ol>
        <table>
          <thead>
            <tr>
              <th>Transaction</th>
              <th>Account</th>
              <th>Debit (₦)</th>
              <th>Credit (₦)</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }, (_, i) => (
              <tr key={i}>
                <td>&nbsp;</td>
                <td />
                <td />
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2>3. Check your work</h2>
        <p>
          Do your total debits equal total credits? Explain why each entry
          affects at least two accounts.
        </p>
        <div className="worksheet-lines" />
      </section>
      <footer>
        Practice material · Folio demo curriculum · Bring this sheet to your
        tutorial.
      </footer>
    </main>
  );
}
