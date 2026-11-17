import IntegrationMailbox from '../src/index';

describe("when using Mail.tm", () => {
    const mailbox = new IntegrationMailbox("MAILTM")

    let emailAddress: string;
    let password: string | undefined;

    beforeAll(async () => {
        emailAddress = await mailbox.createEmailAddress();
        password = mailbox.getPassword();
    })

    it("should generate an email properly", () => {
        expect(emailAddress.includes('@')).toBeTruthy();
        expect(password).toBeTruthy();
    })

    it('should return an empty email list', async () => {
        const emailList = await mailbox.fetchEmailList();
        expect(Array.isArray(emailList)).toBeTruthy();
        expect(emailList.length).toEqual(0);
    });

    it('should not send self mail', async () => {
        await expect(mailbox.sendSelfMail('Subject', 'Body')).rejects.toThrow();
    });

    it('should be able to reuse a mailbox', async () => {
        const otherMailbox = new IntegrationMailbox("MAILTM");
        expect(await otherMailbox.setEmailAddress(emailAddress)).toBeFalsy();
        expect(await otherMailbox.setEmailAddress(emailAddress, 'wrong-password')).toBeFalsy();
        expect(await otherMailbox.setEmailAddress(emailAddress, password)).toBeTruthy();
        expect((await otherMailbox.fetchEmailList()).length).toEqual(0);
    });

    it('should set a chosen email address', async () => {
        const chosenMailbox = new IntegrationMailbox("MAILTM");
        const localPart = 'e2e-' + Math.random().toString(36).substring(2, 10);
        const chosenPassword = 'pw-' + Math.random().toString(36).substring(2);
        expect(await chosenMailbox.setEmailAddress(localPart, chosenPassword)).toBeTruthy();
        expect(chosenMailbox.getPassword()).toEqual(chosenPassword);
        expect((await chosenMailbox.fetchEmailList()).length).toEqual(0);
        expect(await chosenMailbox.forgetEmailAddress(localPart)).toBeTruthy();
    });

    it('should forget email address', async () => {
        expect(await mailbox.forgetEmailAddress(emailAddress)).toBeTruthy();
        expect(mailbox.getPassword()).toBeUndefined();
        // The account is deleted, so it can't be logged into anymore.
        const otherMailbox = new IntegrationMailbox("MAILTM");
        expect(await otherMailbox.setEmailAddress(emailAddress, 'wrong-password')).toBeFalsy();
    });
})
