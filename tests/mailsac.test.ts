import * as nodemailer from 'nodemailer';
import IntegrationMailbox from '../src/index';

// Mailsac requires an API key, the suite is skipped without one.
const describeWithKey = process.env.MAILSAC_API_KEY ? describe : describe.skip;
const smtpUrl = process.env.MAILSAC_TEST_SMTP_URL;
const mailSender = process.env.MAILSAC_TEST_SMTP_FROM;
const transporter = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;
const itWithSmtp = transporter ? it : it.skip;

describeWithKey("when using Mailsac", () => {
    const mailbox = new IntegrationMailbox("MAILSAC")

    let emailAddress: string;
    const subjectLine = 'Mailsac E2E Test - ' + (new Date().toLocaleDateString());
    const emailText = 'Hello from E2E test suite.' + (new Date().toLocaleDateString());

    beforeAll(async () => {
        emailAddress = await mailbox.createEmailAddress();
    })

    it("should generate an email properly", () => {
        expect(emailAddress.endsWith('@mailsac.com')).toBeTruthy();
    })

    it('should return an empty email list', async () => {
        expect((await mailbox.fetchEmailList()).length).toEqual(0);
    });

    it('should set a chosen email address', async () => {
        const localPart = emailAddress.split('@')[0];
        expect(await mailbox.setEmailAddress(localPart)).toBeTruthy();
        expect((await mailbox.fetchEmailList()).length).toEqual(0);
    });

    itWithSmtp('should receive, fetch and delete an email', async () => {
        await transporter!.sendMail({
            from: mailSender, to: emailAddress, subject: subjectLine, text: emailText, html: `<p>${emailText}</p>`,
        });
        const foundEmail = await mailbox.waitForEmail(subjectLine);
        expect(foundEmail).toBeDefined();
        expect(foundEmail!.mail_body).toContain(emailText);
        expect(await mailbox.deleteEmailById(foundEmail!.mail_id)).toBeTruthy();
        expect((await mailbox.fetchEmailList()).length).toEqual(0);
    });

    it('should forget email address', async () => {
        expect(await mailbox.forgetEmailAddress(emailAddress)).toBeTruthy();
    });
})

describe("when using Mailsac without an API key", () => {
    it('should refuse to create an address', async () => {
        const apiKey = process.env.MAILSAC_API_KEY;
        delete process.env.MAILSAC_API_KEY;
        try {
            await expect(new IntegrationMailbox("MAILSAC").createEmailAddress()).rejects.toThrow('API key');
        } finally {
            if (apiKey) process.env.MAILSAC_API_KEY = apiKey;
        }
    });
})
