/**
 * 픽셀리프 비밀번호 재설정 이메일 HTML 템플릿
 * 
 * 디자인 컨셉: 심우주 SF 테마 (회원가입 템플릿과 통일)
 * - 배경: 다크 네이비 #080A0F
 * - 카드: 은하 먼지 #121620, 테두리 #1F2633
 * - 앰버 글로우: #F59E0B (경고/주의)
 * - 퍼플 글로우: #7F56D9 (우주 신비)
 * 
 * 향후 비밀번호 재설정 기능 구현 시 사용
 */

interface RecoveryEmailParams {
  recoveryUrl: string
}

export function getRecoveryEmailHtml({ recoveryUrl }: RecoveryEmailParams): string {
  return `<!DOCTYPE html>
<html lang="ko" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>PIXELYF — 비밀번호 재설정</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#080A0F;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#080A0F;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px 60px;">

        <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;background-color:#121620;border:1px solid #1F2633;border-radius:24px;overflow:hidden;">
          
          <!-- 상단 글로우 (앰버 경고 톤) -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#F59E0B 0%,#7F56D9 50%,#F59E0B 100%);"></td>
          </tr>

          <!-- 로고 -->
          <tr>
            <td align="center" style="padding:40px 32px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:28px;font-weight:800;letter-spacing:-0.5px;line-height:1;">
                    <span style="color:#A855F7;">PIXE</span><span style="color:#FFFFFF;">L</span><span style="color:#6366F1;">YF</span>
                  </td>
                </tr>
              </table>
              <p style="margin:8px 0 0;font-size:11px;color:#64748B;letter-spacing:3px;text-transform:uppercase;">PASSWORD RECOVERY</p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,#1F2633,transparent);"></div>
            </td>
          </tr>

          <!-- 본문 -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#FFFFFF;line-height:1.4;">
                비밀번호 재설정 요청
              </h1>

              <p style="margin:0 0 28px;font-size:14px;color:#94A3B8;line-height:1.7;">
                PIXELYF 계정의 비밀번호 재설정이 요청되었습니다.<br/>
                아래 버튼을 클릭하여 새 비밀번호를 설정하세요.<br/>
                <span style="color:#F59E0B;">이 링크는 1시간 후 만료됩니다.</span>
              </p>

              <!-- CTA 버튼 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="border-radius:14px;background:linear-gradient(135deg,#F59E0B 0%,#7F56D9 100%);">
                          <a href="${recoveryUrl}" target="_blank" style="display:inline-block;padding:16px 48px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;letter-spacing:0.5px;">
                            ✦ 비밀번호 재설정
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:11px;color:#475569;line-height:1.6;word-break:break-all;">
                버튼이 작동하지 않는다면, 아래 주소를 복사하여 브라우저에 붙여넣으세요:<br/>
                <a href="${recoveryUrl}" style="color:#6366F1;text-decoration:underline;">${recoveryUrl}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,#1F2633,transparent);"></div>
            </td>
          </tr>

          <!-- 푸터 -->
          <tr>
            <td style="padding:24px 32px 32px;">
              <p style="margin:0 0 8px;font-size:11px;color:#334155;line-height:1.6;">
                본인이 비밀번호 재설정을 요청하지 않았다면<br/>
                이 이메일을 무시하세요. 비밀번호는 변경되지 않습니다.
              </p>
              <p style="margin:0;font-size:10px;color:#1E293B;letter-spacing:2px;text-transform:uppercase;">
                © 2026 PIXELYF ENTITY. ALL SYSTEMS ONLINE.
              </p>
            </td>
          </tr>

          <tr>
            <td style="height:3px;background:linear-gradient(90deg,#7F56D9 0%,#F59E0B 50%,#7F56D9 100%);"></td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`
}
