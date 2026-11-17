import { MailboxProvider } from '../types';
import MailTmService from './mailTmService';

/**
 * Mail.gw runs the same API as Mail.tm on its own domains, see https://api.mail.gw/domains.
 */
class MailGwService extends MailTmService {

    API_URL = 'https://api.mail.gw';
    PROVIDER: MailboxProvider = 'MAILGW';
}

export default MailGwService;
