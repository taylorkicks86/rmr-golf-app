import { createHmac, timingSafeEqual } from "crypto";

type RsvpChoice = "yes" | "no";

type RsvpTokenPayload = {
  playerId: string;
  weekId: string;
  choice: RsvpChoice;
  exp: number;
};

type ReminderEmailParams = {
  playerName: string;
  weekLabel: string;
  statusLabel?: string;
  yesUrl: string;
  noUrl: string;
};

type TeeSheetAssignment = {
  teeTimeLabel: string;
  groupLabel: string;
  playerName: string;
};

type TeeSheetEmailParams = {
  playerName: string;
  weekLabel: string;
  teeSheetUrl: string;
  assignments: TeeSheetAssignment[];
};

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14;

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function getRsvpTokenSecret(): string {
  const secret = process.env.RSVP_TOKEN_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("Missing RSVP_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return secret;
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getRsvpTokenSecret()).update(encodedPayload).digest("base64url");
}

export function createRsvpToken({
  playerId,
  weekId,
  choice,
  now = new Date(),
}: {
  playerId: string;
  weekId: string;
  choice: RsvpChoice;
  now?: Date;
}): string {
  const payload: RsvpTokenPayload = {
    playerId,
    weekId,
    choice,
    exp: Math.floor(now.getTime() / 1000) + TOKEN_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyRsvpToken(token: string): RsvpTokenPayload {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid RSVP link.");
  }

  const expectedSignature = signPayload(encodedPayload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("Invalid RSVP link.");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<RsvpTokenPayload>;
  if (
    typeof payload.playerId !== "string" ||
    typeof payload.weekId !== "string" ||
    (payload.choice !== "yes" && payload.choice !== "no") ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("Invalid RSVP link.");
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("This RSVP link has expired.");
  }

  return payload as RsvpTokenPayload;
}

export function buildRsvpReminderEmail({
  playerName,
  weekLabel,
  statusLabel = "undecided",
  yesUrl,
  noUrl,
}: ReminderEmailParams): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RMR Golf Weekly RSVP Reminder</title>
  </head>
  <body style="margin:0;background:#f3f5ef;font-family:Arial,Helvetica,sans-serif;color:#171717;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5ef;margin:0;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border-collapse:separate;border-spacing:0;border:1px solid #d9e2d8;background:#fffdf7;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#1d392f;padding:22px 28px;border-bottom:4px solid #15d6ad;border-radius:8px 8px 0 0;">
                <img src="https://rmrgolf.com/rmr-logo.png" width="88" alt="RMR Golf" style="display:block;width:88px;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:0;background:#17372f;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#17372f;">
                  <tr>
                    <td background="https://rmrgolf.com/images/backgrounds/rmr-course-bg.jpg" style="background-image:linear-gradient(rgba(29,57,47,.58),rgba(29,57,47,.58)),url('https://rmrgolf.com/images/backgrounds/rmr-course-bg.jpg');background-size:cover;background-position:center;padding:38px 28px 42px;">
                      <div style="font-size:13px;line-height:18px;letter-spacing:4px;text-transform:uppercase;color:#bceada;font-weight:700;">RMR Golf League</div>
                      <h1 style="margin:12px 0 0;font-size:36px;line-height:40px;color:#ffffff;font-weight:800;letter-spacing:0;">Are you playing this week?</h1>
                      <p style="margin:12px 0 0;font-size:17px;line-height:25px;color:#edf7f1;font-weight:600;">Let us know so the tee sheet can be set.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 10px;background:#fffdf7;">
                <p style="margin:0 0 18px;font-size:17px;line-height:27px;color:#30313a;">Hi ${escapeHtml(playerName)},</p>
                <p style="margin:0 0 22px;font-size:17px;line-height:27px;color:#30313a;">Quick reminder to RSVP for this week so we can keep the groups and tee times accurate.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #b9d9cc;background:#f8fbf5;border-radius:8px;margin:0 0 24px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <div style="font-size:13px;line-height:18px;letter-spacing:2px;text-transform:uppercase;color:#467866;font-weight:800;">This Week</div>
                      <p style="margin:8px 0 0;font-size:22px;line-height:30px;color:#171717;font-weight:800;">${escapeHtml(weekLabel)}</p>
                      <p style="margin:4px 0 0;font-size:15px;line-height:22px;color:#5f6470;">RSVP status: ${escapeHtml(statusLabel)}</p>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 26px;">
                  <tr>
                    <td width="50%" style="padding-right:6px;">
                      <a href="${escapeHtml(yesUrl)}" style="display:block;background:#0a9f6b;border-radius:6px;color:#ffffff;font-size:18px;line-height:22px;font-weight:800;text-align:center;text-decoration:none;padding:16px 12px;">Yes</a>
                    </td>
                    <td width="50%" style="padding-left:6px;">
                      <a href="${escapeHtml(noUrl)}" style="display:block;background:#ffffff;border:1px solid #dbe3dc;border-radius:6px;color:#34343f;font-size:18px;line-height:22px;font-weight:800;text-align:center;text-decoration:none;padding:15px 12px;">No</a>
                    </td>
                  </tr>
                </table>
                <div style="border-left:4px solid #15d6ad;background:#ecf8f2;padding:14px 16px;margin:0 0 24px;">
                  <p style="margin:0;font-size:14px;line-height:22px;color:#1d392f;">Your answer will update the attendance list for the active dashboard week.</p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 24px;background:#1d392f;color:#cfe4d7;"></td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildTeeSheetEmail({
  playerName,
  weekLabel,
  teeSheetUrl,
  assignments,
}: TeeSheetEmailParams): string {
  const assignmentRows = assignments
    .map(
      (assignment) => `
                    <tr>
                      <td style="padding:13px 14px;border-top:1px solid #dfe8df;font-size:15px;line-height:22px;color:#171717;font-weight:800;">${escapeHtml(assignment.teeTimeLabel)}</td>
                      <td style="padding:13px 14px;border-top:1px solid #dfe8df;font-size:15px;line-height:22px;color:#5f6470;">${escapeHtml(assignment.groupLabel)}</td>
                      <td style="padding:13px 14px;border-top:1px solid #dfe8df;font-size:15px;line-height:22px;color:#171717;">${escapeHtml(assignment.playerName)}</td>
                    </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RMR Golf Tee Sheet</title>
  </head>
  <body style="margin:0;background:#f3f5ef;font-family:Arial,Helvetica,sans-serif;color:#171717;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5ef;margin:0;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border-collapse:separate;border-spacing:0;border:1px solid #d9e2d8;background:#fffdf7;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#1d392f;padding:22px 28px;border-bottom:4px solid #15d6ad;border-radius:8px 8px 0 0;">
                <img src="https://rmrgolf.com/rmr-logo.png" width="88" alt="RMR Golf" style="display:block;width:88px;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:0;background:#17372f;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#17372f;">
                  <tr>
                    <td background="https://rmrgolf.com/images/backgrounds/rmr-course-bg.jpg" style="background-image:linear-gradient(rgba(29,57,47,.42),rgba(29,57,47,.42)),url('https://rmrgolf.com/images/backgrounds/rmr-course-bg.jpg');background-size:cover;background-position:center;padding:38px 28px 42px;">
                      <div style="font-size:13px;line-height:18px;letter-spacing:4px;text-transform:uppercase;color:#bceada;font-weight:700;">RMR Golf League</div>
                      <h1 style="margin:12px 0 0;font-size:36px;line-height:40px;color:#ffffff;font-weight:800;letter-spacing:0;">Tee sheet is posted</h1>
                      <p style="margin:12px 0 0;font-size:17px;line-height:25px;color:#edf7f1;font-weight:600;">${escapeHtml(weekLabel)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 10px;background:#fffdf7;">
                <p style="margin:0 0 18px;font-size:17px;line-height:27px;color:#30313a;">Hi ${escapeHtml(playerName)},</p>
                <p style="margin:0 0 22px;font-size:17px;line-height:27px;color:#30313a;">The tee sheet for this week has been published. Here are the current groups and tee times.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #b9d9cc;background:#f8fbf5;border-radius:8px;margin:0 0 24px;border-collapse:separate;border-spacing:0;overflow:hidden;">
                  <tr>
                    <td style="padding:14px;background:#1d392f;color:#ffffff;font-size:13px;line-height:18px;letter-spacing:2px;text-transform:uppercase;font-weight:800;">Time</td>
                    <td style="padding:14px;background:#1d392f;color:#ffffff;font-size:13px;line-height:18px;letter-spacing:2px;text-transform:uppercase;font-weight:800;">Group</td>
                    <td style="padding:14px;background:#1d392f;color:#ffffff;font-size:13px;line-height:18px;letter-spacing:2px;text-transform:uppercase;font-weight:800;">Player</td>
                  </tr>
                  ${assignmentRows}
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 26px;">
                  <tr>
                    <td>
                      <a href="${escapeHtml(teeSheetUrl)}" style="display:block;background:#0a9f6b;border-radius:6px;color:#ffffff;font-size:18px;line-height:22px;font-weight:800;text-align:center;text-decoration:none;padding:16px 12px;">View Tee Sheet</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 24px;background:#1d392f;color:#cfe4d7;"></td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
