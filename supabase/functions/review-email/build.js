// The designed Google review email, as HTML. Plain JavaScript (not TypeScript) so the
// same file is what the edge function sends and what a V8 check can run on its own.
//
// The layout is review-email-mockup.html / assets/email/review.html, approved in
// principle by Jake and Sam: tables, inline styles, Arial, 600 px, with the Outlook for
// Windows fixes (the [if mso] wrapper, bgcolor on the button cell). Only the words come
// from the caller. The stars, button, signature and footer are fixed here on purpose.
//
// Pictures are written as cid: links. The edge function attaches each file inside the
// email under that name, so Outlook shows them without "click to download pictures".
// The app's preview swaps cid:NAME for assets/email/NAME, the same files.

const REVIEW_URL = 'https://search.google.com/local/writereview?placeid=ChIJO526yTG9KogRwrEXa6bIjZA';
const FONT = 'font-family:Arial,Helvetica,sans-serif;';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// One box of typed words, escaped, with its line breaks kept.
function words(s) {
  return esc(String(s).trim()).replace(/\r?\n/g, '<br>');
}

// Bin rentals show the bin truck; every other job shows the junk truck.
export function photoFor(service) {
  return service === 'Bin Rental' ? 'review-photo-bin.jpg' : 'review-photo-junk.jpg';
}

// parts: {heading, p1, p2, tip, closing}. heading is required; an empty paragraph is
// left out. rating: {rating, count} from Google.
export function buildReviewEmail(parts, service, rating) {
  const heading = String(parts.heading || '').trim();
  if (!heading) throw new Error('heading_missing');
  if (typeof rating.rating !== 'number' || typeof rating.count !== 'number') throw new Error('rating_missing');

  const para = (s) => String(s || '').trim()
    ? '<p style="margin:0 0 16px;' + FONT + 'font-size:16px;line-height:24px;color:#15191c;">' + words(s) + '</p>'
    : '';
  const star = '<a href="' + REVIEW_URL + '" style="text-decoration:none;color:#f5b301;font-size:40px;line-height:44px;' + FONT + 'padding:0 4px;">&#9733;</a>';
  const tip = String(parts.tip || '').trim()
    ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr>'
      + '<td style="background:#f3faf5;border-left:4px solid #2fb255;border-radius:6px;padding:12px 14px;"><p style="margin:0;' + FONT + 'font-size:15px;line-height:22px;color:#15191c;">' + words(parts.tip) + '</p></td>'
      + '</tr></table>'
    : '';
  const ratingLine = rating.rating.toFixed(1) + ' from ' + rating.count + ' Google reviews';

  return '<!doctype html>\n'
    + '<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">\n'
    + '<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    + '<meta name="x-apple-disable-message-reformatting">\n<meta name="color-scheme" content="light only">\n<meta name="supported-color-schemes" content="light only">\n'
    + '<title>' + esc(heading) + '</title>\n'
    + '<!--[if mso]><style>table,td,div,p,a{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->\n'
    + '</head>\n'
    + '<body style="margin:0;padding:0;background:#eef0ec;">\n'
    + '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">One tap to leave us a Google review. It takes about a minute.&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>\n'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef0ec;">\n'
    + '<tr><td align="center" style="padding:24px 12px;">\n'
    + '<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->\n'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;">\n'
    + '  <tr><td style="background:#2fb255;padding:16px 24px;">\n'
    + '    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>\n'
    + '      <td style="vertical-align:middle;"><img src="cid:logo.png" width="150" height="68" alt="Jeff\'s Junk" style="display:block;width:150px;height:68px;border:0;border-radius:8px;"></td>\n'
    + '      <td align="right" style="vertical-align:middle;' + FONT + 'font-size:14px;line-height:18px;font-weight:bold;color:#ffffff;">Family-run since 1992</td>\n'
    + '    </tr></table>\n'
    + '  </td></tr>\n'
    + '  <tr><td><img src="cid:' + photoFor(service) + '" width="600" alt="A Jeff\'s Junk truck on a job" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>\n'
    + '  <tr><td style="padding:28px 28px 4px;">\n'
    + '    <h1 style="margin:0 0 14px;' + FONT + 'font-size:26px;line-height:32px;font-weight:bold;color:#15191c;">' + words(heading) + '</h1>\n'
    + '    ' + para(parts.p1) + para(parts.p2) + '\n'
    + '    <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:6px auto 4px;"><tr><td align="center" aria-label="Rate us on Google">' + star + star + star + star + star + '</td></tr></table>\n'
    + '    <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:10px auto 10px;"><tr>\n'
    + '      <td align="center" bgcolor="#15191c" style="border-radius:10px;">\n'
    + '        <a href="' + REVIEW_URL + '" style="display:inline-block;padding:16px 28px;' + FONT + 'font-size:17px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">Leave a Google review</a>\n'
    + '      </td></tr></table>\n'
    + '    <p style="margin:0 0 20px;' + FONT + 'font-size:13px;line-height:18px;color:#59616a;text-align:center;">Tap a star or the button. Both open our Google review page.</p>\n'
    + '    ' + tip + '\n'
    + '    ' + para(parts.closing) + '\n'
    + '  </td></tr>\n'
    // The signature: the logo stands in until there is a photo of Jeff & Barbara (Jake, 2026-10-23).
    + '  <tr><td style="padding:4px 28px 24px;">\n'
    + '    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>\n'
    + '      <td style="vertical-align:middle;padding-right:14px;"><img src="cid:logo.png" width="80" height="36" alt="" style="display:block;width:80px;height:36px;border:0;border-radius:6px;"></td>\n'
    + '      <td style="vertical-align:middle;' + FONT + 'font-size:15px;line-height:21px;color:#15191c;"><b>Jeff &amp; Barbara White</b><br>Owners, Jeff&rsquo;s Junk</td>\n'
    + '    </tr></table>\n'
    + '  </td></tr>\n'
    // CASL: who we are, a mailing address, and a way to opt out.
    + '  <tr><td style="background:#15191c;padding:18px 24px;' + FONT + 'font-size:13px;line-height:20px;color:#c9cec9;">\n'
    + '    <b style="color:#ffffff;">Jeff&rsquo;s Junk</b> &middot; Junk removal &amp; bin rentals &middot; 92 Davidson Street, Unit 2, Barrie, ON<br>\n'
    + '    <span style="color:#f5b301;">&#9733;&#9733;&#9733;&#9733;&#9733;</span> ' + ratingLine + ' &middot; <a href="tel:+17053337767" style="color:#c9cec9;text-decoration:none;">705.333.7767</a> &middot; <a href="https://jeffsjunk.ca" style="color:#c9cec9;text-decoration:none;">jeffsjunk.ca</a><br>\n'
    + '    <span style="color:#8f978f;">Don&rsquo;t want emails like this? Reply &ldquo;stop&rdquo; and we&rsquo;ll take you off our list.</span>\n'
    + '  </td></tr>\n'
    + '</table>\n'
    + '<!--[if mso]></td></tr></table><![endif]-->\n'
    + '</td></tr>\n'
    + '</table>\n'
    + '</body>\n'
    + '</html>\n';
}
