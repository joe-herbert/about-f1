import { createTransport } from 'nodemailer'
import { config } from './config.ts'

const transport = config.smtpUrl ? createTransport(config.smtpUrl) : null

export async function sendSignInCode(email: string, code: string) {
  if (!transport) {
    // Development without SMTP: print the code instead.
    console.log(`\n  Code for ${email}: ${code}\n`)
    return
  }
  await transport.sendMail({
    from: config.mailFrom,
    to: email,
    subject: `${code} is your About F1 code`,
    text: `Your About F1 code is ${code}\n\nIt expires in 5 minutes. If you didn't ask for it, you can ignore this email.`,
  })
}
