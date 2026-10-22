export const GUIDE_HTML = `
<section class="card guide">
  <h2>How it works</h2>
  <p>Letter Ledger replaces the "can you write me a letter?" email thread with a short, structured request, and keeps your own notes on students so each letter starts from facts. It runs entirely in your browser: there is no account and no server holding student records.</p>
  <ol class="steps">
    <li><b>Set your policy and share the link.</b> Under <button class="linkish" data-goto="link">Your request link</button>, enter your name, notice period, grade rule, required documents and questions. The link carries all of it. Put it on your web page or syllabus, or paste it in reply to request emails.</li>
    <li><b>Students fill in one form.</b> Programs with letter deadlines and submission methods, courses with you, CV and statement, answers to your questions, and a FERPA release they sign by typing their name. The form warns them about short notice or a grade below your rule. It produces one encrypted <code>.ledger</code> file that they email to you.</li>
    <li><b>Drop the files on the Dashboard.</b> Each request is opened with your private key, checked against your policy, its release verified, and filed under the student (matched by email). Accept or decline each program.</li>
    <li><b>Track deadlines.</b> The <button class="linkish" data-goto="dashboard">Dashboard</button> sorts every letter by due date and flags overdue and due-this-week letters. Download calendar reminders (.ics) for Google, Outlook or Apple Calendar.</li>
    <li><b>Keep students informed.</b> After a status change, "Email status update" writes the email (accepted, declined, submitted on a date) for your mail app.</li>
    <li><b>Take notes during the term.</b> In <button class="linkish" data-goto="students">Students and notes</button>, type <code>Maya Okafor: great question on hashing #oh</code>. Students who later ask for a letter are matched by name or email, so the notes are waiting.</li>
    <li><b>Write from an outline.</b> "Fact outline" assembles the release terms, courses, your notes, the student's answers and per-program tailoring into a Markdown outline with a suggested five-paragraph structure. One letter can serve several programs: paragraph 4 changes per program.</li>
  </ol>
  <p class="row"><button class="primary" id="guide-demo">Load the demo ledger</button><button data-goto="link">Set up my link</button></p>

  <h3>Privacy and FERPA</h3>
  <ul>
    <li>Request files are sealed in the student's browser to your public key (ECDH P-256 and AES-256-GCM). An intercepted email shows only ciphertext.</li>
    <li>The release names the records, the purpose and the programs, as 34 CFR 99.30 asks, records whether the student waived the right to read the letter, and is stored word for word with a SHA-256 so you can show exactly what was signed. The outline leaves grades out when the release does not cover them.</li>
    <li>A typed name is an electronic signature but does not prove identity. If that matters for a request, confirm it from the student's university email.</li>
    <li>Everything is stored in this browser. Download an encrypted backup under <button class="linkish" data-goto="data">Data and backup</button>; restoring it on another computer brings your key along, so your link keeps working. "Delete student" removes every trace of a student for a deletion request.</li>
  </ul>

  <h3>What it does not do</h3>
  <ul>
    <li>It does not draft the letter for you (no AI) and does not upload to application portals.</li>
    <li>It sends no email on its own: reminders are calendar alarms and status updates open in your mail app, so you see every message before it goes.</li>
    <li>Notes are yours alone; there is no shared department or TA view.</li>
  </ul>
</section>`;
