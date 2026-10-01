/*
 * Intake settings. The only thing you normally need to change is `endpoint`.
 *
 * endpoint: URL of the Google Apps Script web app that emails the finished PDF to the office
 *           (setup steps are in /apps-script/README.md).
 *           Leave it '' and the form still works: patients download their PDF and are asked to
 *           bring it in or send it to the office themselves.
 */
window.INTAKE_CONFIG = {
  endpoint: '',
  practiceName: 'Willow Run Dental, P.C.',
  practiceAddress: '12910 Zuni Street, Suite 600, Westminster, CO 80234',
  practicePhone: '(720) 872-2750',
  practiceFax: '(720) 872-2752',
  practiceEmail: 'Mctuthbrush@msn.com'
};
