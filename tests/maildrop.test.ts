import * as nodemailer from 'nodemailer';
import IntegrationMailbox from '../src/index';
import { EmailResponse } from '../src/types';

const smtpUrl = process.env.MAILDROP_TEST_SMTP_URL;
const mailSender = process.env.MAILDROP_TEST_SMTP_FROM;
const transporter = smtpUrl
    ? nodemailer.createTransport(smtpUrl)
    : null;

const itWithSmtp = transporter ? it : it.skip;

describe("when using MailDrop", () => {
    const mailbox = new IntegrationMailbox("MAILDROP")

    let emailAddress: string;
    let emailList: EmailResponse[] = [];
    const subjectLine = 'MailDrop E2E Test - ' + (new Date().toLocaleDateString());
    const emailText = 'Hello from E2E test suite.' + (new Date().toLocaleDateString());
    const emailBody = `<p>${emailText}</p>`;

    beforeAll(async () => {
        emailAddress = await mailbox.createEmailAddress();
    })

    it("should generate an email properly", () => {
        expect(emailAddress.includes('@')).toBeTruthy();
        expect(emailAddress.endsWith('@maildrop.cc')).toBeTruthy();
    })

    it('should return an empty email list', async () => {
        emailList = await mailbox.fetchEmailList();
        expect(Array.isArray(emailList)).toBeTruthy();
        expect(emailList.length).toEqual(0);
    });

    itWithSmtp('should send an email to the mailbox', async () => {
        const info = await transporter!.sendMail({
            from: mailSender,
            to: emailAddress,
            subject: subjectLine,
            text: emailText,
            html: emailBody,
        });
        expect(info.accepted).toContain(emailAddress);
    });

    itWithSmtp('email should arrive in inbox', async () => {
        const foundEmail = await mailbox.waitForEmail(subjectLine);
        expect(foundEmail).toBeDefined();
        expect(foundEmail!.mail_subject).toContain(subjectLine);
    });

    itWithSmtp('should fetch the full email and verify its contents', async () => {
        emailList = await mailbox.fetchEmailList();
        expect(emailList.length).toBeGreaterThan(0);

        const fullEmail = await mailbox.fetchEmailById(emailList[0].mail_id);
        expect(fullEmail).toBeDefined();
        expect(fullEmail!.mail_subject).toContain(subjectLine);
        expect(fullEmail!.mail_body).toContain(emailText);
    });

    itWithSmtp('should delete email by ID', async () => {
        emailList = await mailbox.fetchEmailList();
        expect(emailList.length).toBeGreaterThan(0);
        const isDeleted = await mailbox.deleteEmailById(emailList[0].mail_id);
        expect(isDeleted).toBeTruthy();

        const updatedList = await mailbox.fetchEmailList();
        expect(updatedList.length).toEqual(0);
    });

    it('should forget email address', async () => {
        const isEmailForgotten = await mailbox.forgetEmailAddress(emailAddress);
        expect(isEmailForgotten).toBeTruthy();
    });
})
