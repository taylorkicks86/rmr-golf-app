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
  courseHandicap: number | null;
  cup: boolean;
};

type TeeSheetEmailParams = {
  playerName: string;
  weekLabel: string;
  teeSheetUrl: string;
  assignments: TeeSheetAssignment[];
};

type CommissionerEmailParams = {
  playerName: string;
  subject: string;
  message: string;
};

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14;

function formatHandicapForDisplay(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "";
  }

  if (value < 0) {
    return `+${Math.abs(value)}`;
  }

  return String(value);
}

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
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
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
  const assignmentsByTime = new Map<string, TeeSheetAssignment[]>();
  assignments.forEach((assignment) => {
    const current = assignmentsByTime.get(assignment.teeTimeLabel) ?? [];
    current.push(assignment);
    assignmentsByTime.set(assignment.teeTimeLabel, current);
  });

  const teeTimeCards = Array.from(assignmentsByTime.entries())
    .map(([teeTimeLabel, rows]) => {
      const playerRows = rows
        .map(
          (assignment) => {
            const handicapLabel = formatHandicapForDisplay(assignment.courseHandicap);
            const handicapCell = handicapLabel
              ? `<td width="34" valign="middle" style="padding:0 8px 0 0;">
                                          <span style="display:inline-block;min-width:22px;border:1px solid #e4e4e7;background:#fafafa;border-radius:3px;padding:2px 4px;text-align:center;font-size:10px;line-height:12px;color:#52525b;font-weight:800;">${escapeHtml(handicapLabel)}</span>
                                        </td>`
              : "";
            const cupMarker = assignment.cup
              ? `<span aria-label="Cup player" title="Cup player" style="display:inline-block;margin-left:2px;font-size:8px;line-height:8px;color:#f59e0b;font-weight:800;vertical-align:super;">C</span>`
              : "";

            return `
                                  <tr>
                                    <td style="padding:10px 12px;border:1px solid #dfe8df;background:#ffffff;border-radius:6px;">
                                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                                        <tr>
                                          ${handicapCell}
                                          <td valign="middle" style="padding:0;font-size:14px;line-height:20px;color:#171717;font-weight:700;">
                                            ${escapeHtml(assignment.playerName)}${cupMarker}
                                          </td>
                                        </tr>
                                      </table>
                                    </td>
                                  </tr>`;
          }
        )
        .join("");

      const groupLabel = rows[0]?.groupLabel ?? "Group";

      return `
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid rgba(29,57,47,.15);background:rgba(255,255,255,.75);border-radius:6px;margin:0 0 14px;border-collapse:separate;border-spacing:0;">
                          <tr>
                            <td style="padding:13px 14px 4px;">
                              <h3 style="margin:0;font-size:15px;line-height:21px;color:#27272a;font-weight:800;">${escapeHtml(teeTimeLabel)}</h3>
                              <p style="margin:2px 0 0;font-size:12px;line-height:18px;color:#71717a;">${escapeHtml(groupLabel)}</p>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:6px 12px 12px;">
                              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 7px;">
                                ${playerRows}
                              </table>
                            </td>
                          </tr>
                        </table>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RMR Golf Tee Sheet</title>
  </head>
  <body style="margin:0;background:#f3f5ef;font-family:Arial,Helvetica,sans-serif;color:#171717;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5ef;margin:0;padding:24px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border-collapse:separate;border-spacing:0;background:#f8f7f2;border-radius:8px;overflow:hidden;border:1px solid #d9e2d8;">
            <tr>
              <td background="https://rmrgolf.com/images/backgrounds/golf_peak_summer.jpg" style="background-image:linear-gradient(rgba(16,52,39,.68),rgba(16,52,39,.68)),url('https://rmrgolf.com/images/backgrounds/golf_peak_summer.jpg');background-size:cover;background-position:center;padding:26px 18px 96px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#17372f;">
                  <tr>
                    <td style="padding:0 0 58px;">
                      <img src="https://rmrgolf.com/rmr-logo.png" width="72" alt="RMR Golf" style="display:block;width:72px;height:auto;border:0;" />
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div style="font-size:12px;line-height:18px;letter-spacing:4px;text-transform:uppercase;color:#d7fff2;font-weight:800;">RMR Golf League</div>
                      <h1 style="margin:12px 0 0;font-size:44px;line-height:48px;color:#ffffff;font-weight:800;letter-spacing:0;">Tee Sheet</h1>
                      <p style="margin:10px 0 0;font-size:18px;line-height:26px;color:#edf7f1;font-weight:700;">View weekly tee times and group assignments.</p>
                      <p style="margin:8px 0 0;font-size:15px;line-height:22px;color:#d7fff2;font-weight:700;">${escapeHtml(weekLabel)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 18px 24px;background:#f8f7f2;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:-54px;border-collapse:separate;border-spacing:0;border:1px solid rgba(29,57,47,.2);background:#f8f7f2;border-radius:8px;overflow:hidden;box-shadow:0 8px 20px rgba(15,23,42,.16);">
                  <tr>
                    <td style="border-bottom:1px solid rgba(6,30,22,.35);background:#1d392f;padding:14px 16px;">
                      <h2 style="margin:0;font-size:22px;line-height:28px;color:#ffffff;font-weight:800;">Tee Sheet Board</h2>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px;">
                      <p style="margin:0 0 16px;font-size:15px;line-height:23px;color:#30313a;">Hi ${escapeHtml(playerName)}, the tee sheet for this week has been published.</p>
                      ${teeTimeCards}
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 0;">
                        <tr>
                          <td>
                            <a href="${escapeHtml(teeSheetUrl)}" style="display:block;background:#0a9f6b;border-radius:6px;color:#ffffff;font-size:17px;line-height:22px;font-weight:800;text-align:center;text-decoration:none;padding:15px 12px;">View Tee Sheet</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 18px 20px;background:#f8f7f2;"></td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildCommissionerEmail({
  playerName,
  subject,
  message,
}: CommissionerEmailParams): string {
  const paragraphs = message
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => paragraph.split(/\n/).map(escapeHtml).join("<br />"))
    .map(
      (paragraph) =>
        `<p style="margin:0 0 18px;font-size:16px;line-height:26px;color:#30313a;">${paragraph}</p>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#f3f5ef;font-family:Arial,Helvetica,sans-serif;color:#171717;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5ef;margin:0;padding:24px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border-collapse:separate;border-spacing:0;background:#f8f7f2;border-radius:8px;overflow:hidden;border:1px solid #d9e2d8;">
            <tr>
              <td background="https://rmrgolf.com/images/backgrounds/golf_peak_summer.jpg" style="background-image:linear-gradient(rgba(16,52,39,.68),rgba(16,52,39,.68)),url('https://rmrgolf.com/images/backgrounds/golf_peak_summer.jpg');background-size:cover;background-position:center;padding:26px 22px 84px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:0 0 46px;">
                      <img src="https://rmrgolf.com/rmr-logo.png" width="72" alt="RMR Golf" style="display:block;width:72px;height:auto;border:0;" />
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div style="font-size:12px;line-height:18px;letter-spacing:4px;text-transform:uppercase;color:#d7fff2;font-weight:800;">RMR Golf League</div>
                      <h1 style="margin:12px 0 0;font-size:36px;line-height:42px;color:#ffffff;font-weight:800;letter-spacing:0;">${escapeHtml(subject)}</h1>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 18px 24px;background:#f8f7f2;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:-44px;border-collapse:separate;border-spacing:0;border:1px solid rgba(29,57,47,.2);background:#fffdf7;border-radius:8px;overflow:hidden;box-shadow:0 8px 20px rgba(15,23,42,.16);">
                  <tr>
                    <td style="border-bottom:1px solid rgba(6,30,22,.35);background:#1d392f;padding:14px 16px;">
                      <h2 style="margin:0;font-size:22px;line-height:28px;color:#ffffff;font-weight:800;">League Commissioner</h2>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:22px 18px 8px;">
                      <p style="margin:0 0 18px;font-size:16px;line-height:26px;color:#30313a;">Hi ${escapeHtml(playerName)},</p>
                      ${paragraphs}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 18px 20px;background:#f8f7f2;"></td>
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
