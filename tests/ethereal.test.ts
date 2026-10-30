import * as nodemailer from 'nodemailer';
import IntegrationMailbox from '../src/index';
import { EmailResponse, SmtpConfig } from '../src/types';

describe("when using Ethereal", () => {
    const mailbox = new IntegrationMailbox("ETHEREAL")

    let emailAddress: string;
    let smtpConfig: SmtpConfig | undefined;
    let emailList: EmailResponse[] = [];
    const subjectLine = 'Ethereal E2E Test - ' + (new Date().toLocaleDateString());
    const emailText = 'Hello from E2E test suite.' + (new Date().toLocaleDateString());
    const emailBody = `<p>${emailText}</p>`;

    beforeAll(async () => {
        emailAddress = await mailbox.createEmailAddress();
        smtpConfig = mailbox.getSmtpConfig();
    })

    it("should generate an email properly", () => {
        expect(emailAddress.endsWith('@ethereal.email')).toBeTruthy();
    })

    it("should expose the SMTP credentials", () => {
        expect(smtpConfig).toBeDefined();
        expect(smtpConfig!.host).toEqual('smtp.ethereal.email');
        expect(smtpConfig!.user).toEqual(emailAddress);
        expect(smtpConfig!.pass).toBeTruthy();
    })

    it('should return an empty email list', async () => {
        emailList = await mailbox.fetchEmailList();
        expect(emailList.length).toEqual(0);
    });

    it('should capture mail sent through the SMTP credentials', async () => {
        const { host, port, secure, user, pass } = smtpConfig!;
        const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
        // Ethereal captures the mail regardless of the recipient.
        await transporter.sendMail({
            from: 'sender@example.com',
            to: 'recipient@example.com',
            subject: subjectLine,
            text: emailText,
            html: emailBody,
        });
        transporter.close();

        const foundEmail = await mailbox.waitForEmail(subjectLine);
        expect(foundEmail).toBeDefined();
        expect(foundEmail!.mail_subject).toEqual(subjectLine);
        expect(foundEmail!.mail_from).toContain('sender@example.com');
        expect(foundEmail!.mail_body).toContain(emailText);
    });

    it('should send an email to own mailbox', async () => {
        const receivedAfter = new Date(Date.now() - 1000);
        const emailHasSent = await mailbox.sendSelfMail('Self Mail', '<p>Testing email body.</p>');
        expect(emailHasSent).toBeTruthy();

        const foundEmail = await mailbox.waitForEmail('Self Mail', 60, receivedAfter);
        expect(foundEmail).toBeDefined();
        expect(foundEmail!.mail_body).toContain('Testing email body.');
    });

    it('should list the newest email first', async () => {
        emailList = await mailbox.fetchEmailList();
        expect(emailList.length).toEqual(2);
        expect(emailList[0].mail_subject).toEqual('Self Mail');
        expect(emailList[0].mail_timestamp).toBeGreaterThanOrEqual(emailList[1].mail_timestamp);
    });

    it('should delete email by ID', async () => {
        const isDeleted = await mailbox.deleteEmailById(emailList[0].mail_id);
        expect(isDeleted).toBeTruthy();

        const updatedList = await mailbox.fetchEmailList();
        expect(updatedList.length).toEqual(1);
        expect(updatedList[0].mail_subject).toEqual(subjectLine);
    });

    it('should be able to reuse a mailbox', async () => {
        const otherMailbox = new IntegrationMailbox("ETHEREAL");
        expect(await otherMailbox.setEmailAddress(emailAddress)).toBeFalsy();
        expect(await otherMailbox.setEmailAddress(emailAddress, 'wrong-password')).toBeFalsy();
        expect(await otherMailbox.setEmailAddress(emailAddress, smtpConfig!.pass)).toBeTruthy();

        const reusedList = await otherMailbox.fetchEmailList();
        expect(reusedList.length).toEqual(1);
        expect(await otherMailbox.purgeEmails()).toEqual(1);
        expect((await otherMailbox.fetchEmailList()).length).toEqual(0);
    });

    it('should forget email address', async () => {
        const isEmailForgotten = await mailbox.forgetEmailAddress(emailAddress);
        expect(isEmailForgotten).toBeTruthy();
        expect(mailbox.getSmtpConfig()).toBeUndefined();
    });
})
