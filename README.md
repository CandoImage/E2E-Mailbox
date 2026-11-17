![example workflow](https://github.com/allynsweet/E2E-Mailbox/actions/workflows/node.js.yml/badge.svg)

# E2E Mailbox

E2E test your email notification system using [DeveloperMail API](https://www.developermail.com/), [GuerrillaMail API](https://www.guerrillamail.com/), [MailDrop API](https://maildrop.cc/), [Mail.tm](https://mail.tm/), [Mailsac](https://mailsac.com/), [Ethereal](https://ethereal.email/), and [Inbucket](https://inbucket.org/).

## Description

A fully-typed and tested TS library for adding email notification testing to your E2E tests. Some use-cases include:

- Registering for a site and checking for the welcome email
- Registering for a site and confirming your email address by pulling the URL from the email body
- Fetching a reset password pin from an email
- Ensuring your system sends the correct email after an action is committed on your website

Configurable to use DeveloperMail, GuerrillaMail, MailDrop, Mail.tm, Mailsac, Ethereal, or Inbucket as the temporary mailbox provider. These are free services generously provided to create short-lived email addresses. If one provider is not working, the other will be used automatically to prevent disruption.

## Providers

| Provider | Key | Send Self Mail | Notes |
|---|---|---|---|
| [DeveloperMail](https://www.developermail.com/) | `DEVELOPER` | ✅ | |
| [GuerrillaMail](https://www.guerrillamail.com/) | `GUERRILLA` | ❌ | |
| [MailDrop](https://maildrop.cc/) | `MAILDROP` | ❌ | Default provider. Receive-only; rate limited to 50 queries per 10-second window |
| [Mail.tm](https://mail.tm/) | `MAILTM` | ❌ | Password protected accounts, see [below](#using-mailtm) |
| [Mailsac](https://mailsac.com/) | `MAILSAC` | ❌ | Requires a (free) API key, see [below](#using-mailsac) |
| [Ethereal](https://ethereal.email/) | `ETHEREAL` | ✅ | Captures mail sent through its SMTP server instead of receiving it, see [below](#using-ethereal) |
| [Inbucket](https://inbucket.org/) | `INBUCKET` | ✅ | Self-hosted, captures mail sent through its SMTP server, see [below](#using-inbucket) |

All providers can re-use an existing address or use a chosen one with `setEmailAddress()`.

## Usage

### Installation

Install the **E2E Mailbox** package with [NPM](https://www.npmjs.com/package/e2e-mailbox) or yarn:

```sh
npm install e2e-mailbox
yarn add e2e-mailbox
```

### Setup

#### Creating an Email Address

```js
import E2EMailbox from 'e2e-mailbox';
// This will create a new mailbox using MailDrop API as the provider.
// Pass 'DEVELOPER', 'GUERRILLA', 'MAILTM', 'MAILSAC', 'ETHEREAL' or 'INBUCKET' to use another provider.
const mailbox = new E2EMailbox();
// This will generate a new email address for you to use in your tests
const emailAddress = await mailbox.createEmailAddress();
```

#### Wait for Email by Subject Line

After an email has been sent to the email address, you could poll for the email's subject line explicitly:

```js
// Set the subject line along with the max timeout in seconds, default is 60 seconds.
const email = await mailbox.waitForEmail('The Subject Line in your Email', 60);

// or you could use the promise chains if you fancy
mailbox.waitForEmail('The Subject Line in your Email').then((email) => {
  if (!email) {
    return;
  }
  // email is found and safe to use now.
});
```

#### Fetch All Emails in Mailbox

```js
// Returns an array of email responses
const emailList = await mailbox.fetchEmailList();
```

#### Fetch Email by ID

Each email has an `email_id` associated with it, this ID could be used to fetch all attachments and body of an email.

```js
const fullEmail = await mailbox.fetchEmailById(emailID);
```

#### Delete Email by ID

```js
const isEmailDeleted = await mailbox.deleteEmailById(email.mail_id);
```

#### Using Ethereal

[Ethereal](https://ethereal.email/) is a fake SMTP service: it never delivers mail and has no public MX. Instead, every
message sent through an account's SMTP server is captured in that account's inbox, whatever the recipient is. This
makes it a good fit when you control the SMTP settings of the system under test, as nothing leaves the sandbox.

```js
const mailbox = new E2EMailbox('ETHEREAL');
const emailAddress = await mailbox.createEmailAddress();
// Configure the system under test to send its mails through these credentials.
const { host, port, secure, user, pass } = mailbox.getSmtpConfig();
```

Ethereal accounts are password protected, so re-using an existing one requires its password:

```js
await mailbox.setEmailAddress(emailAddress, pass);
```

Ethereal has no API to delete an account; `forgetEmailAddress()` only clears the local credentials.

#### Using Mail.tm

[Mail.tm](https://mail.tm/) mailboxes are accounts protected by a password. `createEmailAddress()` creates one with
a random address and password; keep the password to re-use the address later:

```js
const mailbox = new E2EMailbox('MAILTM');
const emailAddress = await mailbox.createEmailAddress();
const password = mailbox.getPassword();
// Later, possibly in another test run:
await mailbox.setEmailAddress(emailAddress, password);
```

`setEmailAddress()` creates the account if it doesn't exist yet, so it can also pick an address. The domain has to be
one Mail.tm currently offers (see [api.mail.tm/domains](https://api.mail.tm/domains)); pass only the local part to use
the current one:

```js
await mailbox.setEmailAddress('my-signup-test', 'a-password');
```

`forgetEmailAddress()` deletes the account including its emails. Mail.tm allows 8 requests per second per IP.

#### Using Mailsac

[Mailsac](https://mailsac.com/) receives mail for any `@mailsac.com` address without creating it first, but reading
mail requires an API key (free tier available). Pass it as option or set the `MAILSAC_API_KEY` environment variable:

```js
const mailbox = new E2EMailbox('MAILSAC', { mailsac: { apiKey: 'your-key' } });
await mailbox.setEmailAddress('my-signup-test'); // my-signup-test@mailsac.com
```

A full address is kept as is, so custom domains of your Mailsac account work as well. Addresses on `mailsac.com` are
public: anyone knowing one can read its mails.

#### Using Inbucket

[Inbucket](https://inbucket.org/) is a self-hosted catch-all SMTP server, eg. run as container next to the system
under test. Nothing leaves your environment and any address works without being created first.

```sh
docker run -d -p 9000:9000 -p 2500:2500 inbucket/inbucket
```

```js
const mailbox = new E2EMailbox('INBUCKET', {
  // All optional, defaults shown. Also configurable via the INBUCKET_URL, INBUCKET_DOMAIN,
  // INBUCKET_SMTP_HOST and INBUCKET_SMTP_PORT environment variables.
  inbucket: { url: 'http://localhost:9000', domain: 'inbucket.local', smtpHost: 'localhost', smtpPort: 2500 },
});
const emailAddress = await mailbox.createEmailAddress();
// Configure the system under test to send its mails through this SMTP server, no authentication needed.
const { host, port } = mailbox.getSmtpConfig();
```

The mailbox name is the local part of the address. `forgetEmailAddress()` purges the mailbox.

### Example Usage in Tests

#### Checking if email was generated

The first test in the suite should generate a new email to be used by later tests.

```js
const mailbox = new E2EMailbox();
let emailAddress = '';
test('should generate an email properly', async () => {
  emailAddress = await mailbox.createEmailAddress();
  expect(emailAddress).toBeDefined();
});
```

#### Checking if email was sent

After registering for your service during the integration test, we should test to make sure the email was sent out in a timely manner.

```js
it('should send a confirm account email', async () => {
  // 'Confirm Your Email' is the subject line of the email in this case
  const foundEmail = await mailbox.waitForEmail('Confirm Your Email', 100);
  expect(!!foundEmail).toBeTruthy();
});
```

Next, if you have a confirmation link in the email, you could pull it from the email body:

```js
it('should confirm account and go to login page', async () => {
  expect(foundEmail).toBeDefined();
  if (!foundEmail) {
    return;
  }
  const urls = mailbox.extractLinksFromEmail(foundEmail);
  const [confirmUrl] = urls.filter((url) => url.includes('https://example.com/your_confirm_url'));
  expect(confirmUrl).toBeDefined();
  if (!confirmUrl) return;
  // navigate to your confirmUrl in your test
});
```

## License

This library is released under the
[MIT license](https://opensource.org/licenses/MIT).
