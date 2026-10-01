# New patient forms: delivery setup

The intake form (`/intake.html`) builds the finished PDF **on the patient's device**. Nothing is
stored on the website. When the patient presses **Send**, the PDF is posted to a small Google Apps
Script, which emails it to the office. Until you do the setup below, the form still works: patients
just get a PDF to download and email or bring in themselves.

## Turn on email delivery (about 5 minutes)

1. Go to <https://script.google.com> while signed in to the Google account that should send the
   emails, then **New project**.
2. Replace the contents of `Code.gs` with the file in this folder. Check `OFFICE_EMAIL` at the top.
3. **Deploy → New deployment → type: Web app**
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
   Authorize when prompted (it needs permission to send mail).
4. Copy the **Web app URL** (ends in `/exec`).
5. Paste it into `intake/config.js` as `endpoint`, then re-upload the site.
6. Test it with a fake patient and confirm the PDF arrives. Visiting the `/exec` URL in a browser
   should show `{"ok":true,"service":"willow-run-intake"}`.

Re-deploying after any script edit: **Deploy → Manage deployments → edit → New version**.

## Please read: patient privacy (HIPAA)

These forms collect protected health information (health history, date of birth, optionally an SSN).
The website side is built to minimise exposure (no server, no storage, no third-party scripts, and
the page asks search engines not to index it). The **delivery path** is the part that needs a
deliberate decision by the practice:

- **Consumer Gmail / Google accounts are not covered by a HIPAA Business Associate Agreement (BAA).**
  Google Workspace (paid) can be covered once the account holder signs Google's BAA. If this script
  runs under a personal Gmail, health information is passing through a service the practice has no
  BAA with.
- **The destination inbox matters too.** The office address on the paper forms is an `@msn.com` mailbox.
  Consumer webmail has no BAA either. A practice-owned domain on Workspace, or a HIPAA-compliant
  email/secure-inbox service, is the usual answer.
- **This script keeps the email itself free of patient details** (subject + body contain only a
  reference number). The PDF attachment still contains everything.
- Make it the practice's decision, ideally with whoever handles their HIPAA compliance. Moving to a
  compliant path later is only a change to `Code.gs` / `endpoint`; the form does not change.

Other things worth deciding:

- **SSN.** It is optional on the form and says patients may give it in person. Many practices have
  stopped collecting it online; consider removing the field (`ssn` and `spSsn` in `intake/schema.js`).
- **Spam / abuse.** A website can't keep a secret, so the endpoint is public. The form includes a hidden
  honeypot field and the script only accepts real PDFs under 6 MB. If it ever gets abused, add a
  CAPTCHA or move to a service with built-in protection.
- **Quotas.** Apps Script on a personal account can send about 100 emails a day, Workspace about 1,500.

## Editing the form

- Questions: `intake/schema.js`. Each "block" there is one short screen in the form (about 24 screens in 9 sections); move a question between blocks to change which screen it appears on. The on-screen form and the PDF both read from it.
- Policy and legal wording: `intake/policies.js`. Also drives both.
- Where the PDF goes: `intake/config.js` (`endpoint`) and `apps-script/Code.gs`.

## Wording on the original paper forms the practice may want to fix

Kept exactly as written so nothing legal changed without the practice's say-so. These are in
`intake/policies.js`:

- "...it the patient's responsibility to resubmit..." (probably *it is*).
- "the patients' responsibility" / "The patients estimated portion" (apostrophes).
- "RPC Treatments" (unclear abbreviation).
- Privacy notice: "We may use of disclose", "other information or other information" (duplicated),
  "please give it to use in writing", and the amendment sentence "If we agree to an amendment or change,
  we will be happy to include your statement in your file." appears twice.
- Records release: "accept these records as a complete history of the Patient's tenure with
  Dr. McMurtrey" reads as if the form is for releasing records *from* this office, but the form is
  used to request them *to* it.
- The paper form said "HIPPA"; the digital version says "Notice of Privacy Practices".
- The paper release form lists the email as `www.mctuthbrush@msn.com`; the digital version uses
  `Mctuthbrush@msn.com`.
- The paper financial policy is dated 10/22/2010. Worth a review.
