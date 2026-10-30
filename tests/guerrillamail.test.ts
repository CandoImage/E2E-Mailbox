import * as nodemailer from 'nodemailer';
import IntegrationMailbox from '../src/index';
import { EmailResponse } from '../src/types';

const smtpUrl = process.env.GUERRILLA_TEST_SMTP_URL;
const mailSender = process.env.GUERRILLA_TEST_SMTP_FROM;
const transporter = smtpUrl
    ? nodemailer.createTransport(smtpUrl)
    : null;

const itWithSmtp = transporter ? it : it.skip;

describe("when using GuerrillaMail", () => {
    const mailbox = new IntegrationMailbox("GUERRILLA")

    let emailAddress: string;
    let emailList: EmailResponse[] = [];
    // GuerrillaMail puts this mail into every new session's inbox.
    const welcomeSubject = 'Welcome to Guerrilla Mail';
    const subjectLine = 'GuerrillaMail E2E Test - ' + (new Date().toLocaleDateString());
    const emailText = 'Hello from E2E test suite.' + (new Date().toLocaleDateString());
    const emailBody = `<p>${emailText}</p>`;

    beforeAll(async () => {
        emailAddress = await mailbox.createEmailAddress();
    })

    afterAll(() => {
        transporter?.close();
    })

    it("should generate an email properly", () => {
        expect(emailAddress.includes('@')).toBeTruthy();
    })

    it('should return the welcome email', async () => {
        emailList = await mailbox.fetchEmailList();
        expect(emailList.length).toEqual(1);
        expect(emailList[0].mail_subject).toEqual(welcomeSubject);
    });

    it('should fetch the full email by ID', async () => {
        const fullEmail = await mailbox.fetchEmailById(emailList[0].mail_id);
        expect(fullEmail).toBeDefined();
        expect(fullEmail!.mail_subject).toEqual(welcomeSubject);
        expect(fullEmail!.mail_body).toBeTruthy();
    });

    it('should wait for an email to arrive', async () => {
        const foundEmail = await mailbox.waitForEmail(welcomeSubject, 10);
        expect(foundEmail).toBeDefined();
        expect(foundEmail!.mail_body).toBeTruthy();
    });

    it('should delete email by ID', async () => {
        const isDeleted = await mailbox.deleteEmailById(emailList[0].mail_id);
        expect(isDeleted).toBeTruthy();

        const updatedList = await mailbox.fetchEmailList();
        expect(updatedList.length).toEqual(0);
    });

    itWithSmtp('should receive an email sent to the mailbox', async () => {
        const receivedAfter = new Date(Date.now() - 60000);
        const info = await transporter!.sendMail({
            from: mailSender,
            to: emailAddress,
            subject: subjectLine,
            text: emailText,
            html: emailBody,
        });
        expect(info.accepted).toContain(emailAddress);

        const foundEmail = await mailbox.waitForEmail(subjectLine, 120, receivedAfter);
        expect(foundEmail).toBeDefined();
        expect(foundEmail!.mail_body).toContain(emailText);
    });

    itWithSmtp('should purge all emails', async () => {
        const purgedCount = await mailbox.purgeEmails();
        expect(purgedCount).toBeGreaterThan(0);
        expect((await mailbox.fetchEmailList()).length).toEqual(0);
    });

    it('should be able to reuse a mailbox', async () => {
        const otherMailbox = new IntegrationMailbox("GUERRILLA");
        const isEmailSet = await otherMailbox.setEmailAddress(emailAddress);
        expect(isEmailSet).toBeTruthy();

        const reusedList = await otherMailbox.fetchEmailList();
        expect(Array.isArray(reusedList)).toBeTruthy();
        // The welcome email only exists in the session that created the address.
        expect(reusedList.some(email => email.mail_subject === welcomeSubject)).toBeFalsy();
    });

    it('should forget email address', async () => {
        const isEmailForgotten = await mailbox.forgetEmailAddress(emailAddress);
        expect(isEmailForgotten).toBeTruthy();
    });
})
