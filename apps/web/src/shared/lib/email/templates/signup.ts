/**
 * 픽셀리프 회원가입 인증 이메일 HTML 템플릿
 *
 * 디자인 컨셉: 심우주 SF 테마
 * - 배경: 다크 네이비 #080A0F
 * - 카드: 은하 먼지 #121620, 테두리 #1F2633
 * - 시안 글로우: #00F2FE (새로운 시작)
 * - 퍼플 글로우: #7F56D9 (우주 신비)
 * - CTA 버튼: 시안→퍼플 그라디언트 캡슐
 *
 * 이메일 크로스 클라이언트 호환:
 * - table 레이아웃, inline style, 웹폰트 폴백
 */

interface SignupEmailParams {
  displayName: string;
  confirmationUrl: string;
}

export function getSignupEmailHtml({
  displayName,
  confirmationUrl,
}: SignupEmailParams): string {
  return `<!DOCTYPE html>
<html lang="ko" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>PIXELYF — 은하 궤도 탑승 안내</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <!-- 최외곽 래퍼 -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center">

        <!-- 메인 카드 (최대 480px) -->
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;background-color:#121620;border:1px solid #1F2633;border-radius:24px;overflow:hidden;">

          <!-- 상단 글로우 그라디언트 바 -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#00F2FE 0%,#7F56D9 50%,#00F2FE 100%);"></td>
          </tr>

          <!-- 로고 영역 -->
          <tr>
            <td align="center" style="padding:40px 32px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:32px;font-weight:800;letter-spacing:-0.5px;line-height:1;">
                    <span style="color:#A855F7;">PIXE</span><span style="color:#FFFFFF;">L</span><span style="color:#6366F1;">YF</span>
                  </td>
                </tr>
              </table>
              <p style="margin:8px 0 0;font-size:11px;color:#64748B;letter-spacing:3px;text-transform:uppercase;">UNIVERSE ONBOARDING</p>
            </td>
          </tr>

          <!-- 구분선 -->
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,#1F2633,transparent);"></div>
            </td>
          </tr>

          <!-- 본문 영역 -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <!-- 인사말 -->
              <p style="margin:0 0 6px;font-size:13px;color:#64748B;">새로운 픽셀리어에게,</p>
              <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#FFFFFF;line-height:1.4;">
                <span style="color:#00F2FE;">${displayName}</span>님의<br/>픽셀리프 계정 생성 확인
              </h1>

              <!-- 설명 텍스트 -->
              <p style="margin:0 0 28px;font-size:14px;color:#94A3B8;line-height:1.7;">
                픽셀리프에 가입해 주셔서 감사합니다.<br/>
                아래 버튼을 클릭하면 이메일 인증이 완료되고,<br/>
                나만의 <span style="color:#00F2FE;">픽셀</span>이 활성화됩니다.
              </p>

              <!-- CTA 버튼 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="border-radius:14px;background-color:#FFFFFF;">
                          <a href="${confirmationUrl}" target="_blank" style="display:inline-block;padding:16px 48px;font-size:15px;font-weight:700;color:#000000;text-decoration:none;letter-spacing:0.5px;">
                            이메일 인증하기
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- 대체 링크 -->
              <p style="margin:24px 0 0;font-size:11px;color:#475569;line-height:1.6;word-break:break-all;">
                버튼이 작동하지 않는다면, 아래 주소를 복사하여 브라우저에 붙여넣으세요:<br/>
                <a href="${confirmationUrl}" style="color:#6366F1;text-decoration:underline;">${confirmationUrl}</a>
              </p>
            </td>
          </tr>

          <!-- 구분선 -->
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,#1F2633,transparent);"></div>
            </td>
          </tr>

          <!-- 푸터 -->
          <tr>
            <td style="padding:24px 32px 32px;">
              <p style="margin:0 0 8px;font-size:11px;color:#64748B;line-height:1.6;">
                이 이메일은 PIXELYF 가입 요청에 의해 자동 발송되었습니다.<br/>
                본인이 요청하지 않았다면 이 메일을 무시하셔도 안전합니다.
              </p>
              <p style="margin:0;font-size:10px;color:#475569;letter-spacing:2px;text-transform:uppercase;">
                © 2026 PIXELYF ENTITY. ALL SYSTEMS ONLINE.
              </p>
            </td>
          </tr>

          <!-- 하단 글로우 바 -->
          <tr>
            <td style="height:3px;background:linear-gradient(90deg,#7F56D9 0%,#00F2FE 50%,#7F56D9 100%);"></td>
          </tr>

        </table>
        <!-- /메인 카드 -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}
