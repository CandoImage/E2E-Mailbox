import * as nodemailer from 'nodemailer';
import IntegrationMailbox from '../src/index';

// testmail.app requires an API key and namespace, the live suite is skipped without them.
const describeWithKey = process.env.TESTMAIL_API_KEY && process.env.TESTMAIL_NAMESPACE ? describe : describe.skip;
const smtpUrl = process.env.TESTMAIL_TEST_SMTP_URL;
const mailSender = process.env.TESTMAIL_TEST_SMTP_FROM;
const transporter = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;
const itWithSmtp = transporter ? it : it.skip;

describeWithKey("when using testmail.app", () => {
    const mailbox = new IntegrationMailbox("TESTMAIL")
    const namespace = (process.env.TESTMAIL_NAMESPACE || '').toLowerCase();

    let emailAddress: string;
    const subjectLine = 'testmail.app E2E Test - ' + (new Date().toLocaleDateString());
    const emailText = 'Hello from E2E test suite.' + (new Date().toLocaleDateString());

    beforeAll(async () => {
        emailAddress = await mailbox.createEmailAddress();
    })

    it("should generate an email properly", () => {
        expect(emailAddress.startsWith(`${namespace}.`)).toBeTruthy();
        expect(emailAddress.endsWith('@inbox.testmail.app')).toBeTruthy();
    })

    it('should return an empty email list', async () => {
        expect((await mailbox.fetchEmailList()).length).toEqual(0);
    });

    itWithSmtp('should receive and fetch an email', async () => {
        await transporter!.sendMail({
            from: mailSender, to: emailAddress, subject: subjectLine, text: emailText, html: `<p>${emailText}</p>`,
        });
        const foundEmail = await mailbox.waitForEmail(subjectLine);
        expect(foundEmail).toBeDefined();
        expect(foundEmail!.mail_body).toContain(emailText);
        expect(await mailbox.deleteEmailById(foundEmail!.mail_id)).toBeFalsy();
    });

    it('should forget email address', async () => {
        expect(await mailbox.forgetEmailAddress(emailAddress)).toBeTruthy();
    });
})

describe("when configuring testmail.app", () => {
    it('should refuse to create an address without API key and namespace', async () => {
        const { TESTMAIL_API_KEY, TESTMAIL_NAMESPACE } = process.env;
        delete process.env.TESTMAIL_API_KEY;
        delete process.env.TESTMAIL_NAMESPACE;
        try {
            await expect(new IntegrationMailbox("TESTMAIL").createEmailAddress()).rejects.toThrow('API key');
        } finally {
            if (TESTMAIL_API_KEY) process.env.TESTMAIL_API_KEY = TESTMAIL_API_KEY;
            if (TESTMAIL_NAMESPACE) process.env.TESTMAIL_NAMESPACE = TESTMAIL_NAMESPACE;
        }
    });

    it('should only accept addresses of the configured namespace', async () => {
        const mailbox = new IntegrationMailbox("TESTMAIL", { testmail: { apiKey: 'key', namespace: 'MyNs' } });
        expect(await mailbox.setEmailAddress('signup')).toBeTruthy();
        expect(await mailbox.setEmailAddress('myns.signup@inbox.testmail.app')).toBeTruthy();
        expect(await mailbox.setEmailAddress('other.signup@inbox.testmail.app')).toBeFalsy();
        expect(await mailbox.setEmailAddress('myns.signup@example.com')).toBeFalsy();
        expect(await mailbox.setEmailAddress('myns.@inbox.testmail.app')).toBeFalsy();
    });
})
