import * as nodemailer from 'nodemailer';
import IntegrationMailbox from '../src/index';

const smtpUrl = process.env.HARAKIRI_TEST_SMTP_URL;
const mailSender = process.env.HARAKIRI_TEST_SMTP_FROM;
const transporter = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;
const itWithSmtp = transporter ? it : it.skip;

describe("when using Harakiri Mail", () => {
    const mailbox = new IntegrationMailbox("HARAKIRI")

    let emailAddress: string;
    const subjectLine = 'Harakiri Mail E2E Test - ' + (new Date().toLocaleDateString());
    const emailText = 'Hello from E2E test suite.' + (new Date().toLocaleDateString());

    beforeAll(async () => {
        emailAddress = await mailbox.createEmailAddress();
    })

    it("should generate an email properly", () => {
        expect(emailAddress.endsWith('@harakirimail.com')).toBeTruthy();
    })

    it('should return an empty email list', async () => {
        const emailList = await mailbox.fetchEmailList();
        expect(Array.isArray(emailList)).toBeTruthy();
        expect(emailList.length).toEqual(0);
    });

    it('should set a chosen email address', async () => {
        const otherMailbox = new IntegrationMailbox("HARAKIRI");
        expect(await otherMailbox.setEmailAddress(emailAddress.split('@')[0])).toBeTruthy();
        expect((await otherMailbox.fetchEmailList()).length).toEqual(0);
    });

    it('should not support deleting emails', async () => {
        expect(await mailbox.deleteEmailById('6afc096702944c7611ce12d8')).toBeFalsy();
    });

    itWithSmtp('should receive and fetch an email', async () => {
        await transporter!.sendMail({
            from: mailSender, to: emailAddress, subject: subjectLine, text: emailText, html: `<p>${emailText}</p>`,
        });
        const foundEmail = await mailbox.waitForEmail(subjectLine);
        expect(foundEmail).toBeDefined();
        expect(foundEmail!.mail_body).toContain(emailText);
    });

    it('should forget email address', async () => {
        expect(await mailbox.forgetEmailAddress(emailAddress)).toBeTruthy();
    });
})
