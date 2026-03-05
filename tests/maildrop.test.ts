import IntegrationMailbox from '../src/index';
import { EmailResponse } from '../src/types';

describe("when using MailDrop", () => {
    const mailbox = new IntegrationMailbox("MAILDROP")

    let emailAddress: string;
    let emailList: EmailResponse[] = [];

    beforeAll(async () => {
        emailAddress = await mailbox.createEmailAddress();
    })

    it("should generate an email properly", () => {
        expect(emailAddress.includes('@')).toBeTruthy();
        expect(emailAddress.endsWith('@maildrop.cc')).toBeTruthy();
    })

    it('should return an email list', async () => {
        emailList = await mailbox.fetchEmailList();
        expect(Array.isArray(emailList)).toBeTruthy();
    });

    it('should forget email address', async () => {
        const isEmailForgotten = await mailbox.forgetEmailAddress(emailAddress);
        expect(isEmailForgotten).toBeTruthy();
    });
})
