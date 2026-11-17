import * as nodemailer from 'nodemailer';
import IntegrationMailbox from '../src/index';
import { EmailResponse, SmtpConfig } from '../src/types';

// Mailpit is self-hosted, the suite needs MAILPIT_URL pointing to a running instance, eg.
// docker run -p 8025:8025 -p 1025:1025 axllent/mailpit

const describeWithMailpit = process.env.MAILPIT_URL ? describe : describe.skip;

describeWithMailpit("when using Mailpit", () => {
    const mailbox = new IntegrationMailbox("MAILPIT")

    let emailAddress: string;
    let smtpConfig: SmtpConfig | undefined;
    let emailList: EmailResponse[] = [];
    const subjectLine = 'Mailpit E2E Test - ' + (new Date().toLocaleDateString());
    const emailText = 'Hello from E2E test suite.' + (new Date().toLocaleDateString());

    beforeAll(async () => {
        emailAddress = await mailbox.createEmailAddress();
        smtpConfig = mailbox.getSmtpConfig();
    })

    it("should generate an email properly", () => {
        expect(emailAddress.includes('@')).toBeTruthy();
        expect(smtpConfig).toBeDefined();
    })

    it('should return an empty email list', async () => {
        expect((await mailbox.fetchEmailList()).length).toEqual(0);
    });

    it('should capture mail sent through the SMTP server', async () => {
        const { host, port, secure } = smtpConfig!;
        const transporter = nodemailer.createTransport({ host, port, secure });
        await transporter.sendMail({
            from: 'sender@example.com', to: emailAddress, subject: subjectLine, text: emailText, html: `<p>${emailText}</p>`,
        });
        transporter.close();

        const foundEmail = await mailbox.waitForEmail(subjectLine);
        expect(foundEmail).toBeDefined();
        expect(foundEmail!.mail_from).toContain('sender@example.com');
        expect(foundEmail!.mail_body).toContain(emailText);
    });

    it('should send an email to own mailbox', async () => {
        const receivedAfter = new Date(Date.now() - 1000);
        expect(await mailbox.sendSelfMail('Self Mail', '<p>Testing email body.</p>')).toBeTruthy();
        const foundEmail = await mailbox.waitForEmail('Self Mail', 60, receivedAfter);
        expect(foundEmail).toBeDefined();
        expect(foundEmail!.mail_body).toContain('Testing email body.');
    });

    it('should list the newest email first', async () => {
        emailList = await mailbox.fetchEmailList();
        expect(emailList.length).toEqual(2);
        expect(emailList[0].mail_subject).toEqual('Self Mail');
    });

    it('should delete email by ID', async () => {
        expect(await mailbox.deleteEmailById(emailList[0].mail_id)).toBeTruthy();
        const updatedList = await mailbox.fetchEmailList();
        expect(updatedList.length).toEqual(1);
        expect(updatedList[0].mail_subject).toEqual(subjectLine);
    });

    it('should only list mails sent to the exact address', async () => {
        const { host, port, secure } = smtpConfig!;
        const transporter = nodemailer.createTransport({ host, port, secure });
        await transporter.sendMail({ from: 'sender@example.com', to: 'x' + emailAddress, subject: 'Other mailbox', text: 'x' });
        transporter.close();
        const updatedList = await mailbox.fetchEmailList();
        expect(updatedList.length).toEqual(1);
        expect(updatedList[0].mail_subject).toEqual(subjectLine);
        const otherMailbox = new IntegrationMailbox("MAILPIT");
        await otherMailbox.setEmailAddress('x' + emailAddress);
        expect(await otherMailbox.forgetEmailAddress('x' + emailAddress)).toBeTruthy();
    });

    it('should set a chosen email address', async () => {
        const otherMailbox = new IntegrationMailbox("MAILPIT");
        expect(await otherMailbox.setEmailAddress(emailAddress)).toBeTruthy();
        expect((await otherMailbox.fetchEmailList()).length).toEqual(1);
    });

    it('should forget email address', async () => {
        expect(await mailbox.forgetEmailAddress(emailAddress)).toBeTruthy();
        const otherMailbox = new IntegrationMailbox("MAILPIT");
        await otherMailbox.setEmailAddress(emailAddress);
        expect((await otherMailbox.fetchEmailList()).length).toEqual(0);
    });
})
