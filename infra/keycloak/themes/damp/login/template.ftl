<#--
  DAMP login layout: navy brand panel on the left, form on the right (they
  stack on a phone). It keeps base template.ftl's macro signature and nested
  sections (header, show-username, form, socialProviders, info), so every
  page from the `base` parent renders inside it unchanged.
-->
<#import "footer.ftl" as loginFooter>
<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html class="${properties.kcHtmlClass!}" lang="<#if realm.internationalizationEnabled>${locale.currentLanguageTag}<#else>en</#if>"<#if realm.internationalizationEnabled> dir="${(locale.rtl)?then('rtl','ltr')}"</#if>>
<head>
    <meta charset="utf-8">
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${msg("loginTitle",(realm.displayName!'DAMP'))}</title>
    <link rel="icon" type="image/svg+xml" href="${url.resourcesPath}/img/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet">
        </#list>
    </#if>
    <#if scripts??>
        <#list scripts as script>
            <script src="${script}" type="text/javascript"></script>
        </#list>
    </#if>
    <script type="importmap">
        { "imports": { "rfc4648": "${url.resourcesCommonPath}/vendor/rfc4648/rfc4648.js" } }
    </script>
    <script src="${url.resourcesPath}/js/menu-button-links.js" type="module"></script>
    <script type="module">
        import { startSessionPolling } from "${url.resourcesPath}/js/authChecker.js";
        startSessionPolling("${url.ssoLoginInOtherTabsUrl?no_esc}");
    </script>
</head>

<body class="${properties.kcBodyClass!} ${bodyClass}">
<div class="${properties.kcLoginClass!}">

    <aside class="damp-brand" aria-label="About DAMP">
        <svg class="damp-brand-orbit damp-spin" width="620" height="620" viewBox="0 0 200 200" aria-hidden="true"><rect x="45" y="45" width="80" height="80" rx="6" transform="rotate(45 85 85)" fill="none" stroke="#1FD3E6" stroke-width="3"/><rect x="75" y="75" width="80" height="80" rx="6" transform="rotate(45 115 115)" fill="none" stroke="#FFFFFF" stroke-width="3"/></svg>
        <svg class="damp-brand-orbit-sm damp-spin-back" width="360" height="360" viewBox="0 0 200 200" aria-hidden="true"><rect x="45" y="45" width="80" height="80" rx="6" transform="rotate(45 85 85)" fill="none" stroke="#FFFFFF" stroke-width="4"/></svg>

        <div class="damp-wordmark">
            <svg width="40" height="40" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="14" fill="#FFFFFF"/><rect x="10" y="14" width="16" height="16" rx="3.5" transform="rotate(45 18 22)" fill="none" stroke="#1FD3E6" stroke-width="3"/><rect x="22" y="18" width="16" height="16" rx="3.5" transform="rotate(45 30 26)" fill="none" stroke="#0E2463" stroke-width="3"/></svg>
            <span>${kcSanitize(msg("loginTitleHtml",(realm.displayNameHtml!'DAMP')))?no_esc}</span>
        </div>

        <div class="damp-brand-copy damp-rise">
            <p class="damp-brand-title">${msg("damp.brand.tagline")}</p>
            <p class="damp-brand-lede">${msg("damp.brand.lede")}</p>
        </div>

        <div class="damp-brand-preview damp-rise-late" aria-hidden="true">
            <div class="damp-preview-strip">
                <span class="damp-live"></span>
                <span>${msg("damp.brand.flow")}</span>
                <span class="damp-mono">USD-X</span>
            </div>
            <ol class="damp-preview-steps">
                <li><span class="damp-step-dot is-done">1</span>${msg("damp.brand.flowStep1")}</li>
                <li><span class="damp-step-dot is-done">2</span>${msg("damp.brand.flowStep2")}</li>
                <li><span class="damp-step-dot is-now">3</span>${msg("damp.brand.flowStep3")}</li>
            </ol>
        </div>

        <ul class="damp-brand-points">
            <li><span class="damp-tick" aria-hidden="true"></span>${msg("damp.brand.point1")}</li>
            <li><span class="damp-tick" aria-hidden="true"></span>${msg("damp.brand.point2")}</li>
            <li><span class="damp-tick" aria-hidden="true"></span>${msg("damp.brand.point3")}</li>
        </ul>
    </aside>

    <main class="damp-main">
        <div class="${properties.kcFormCardClass!}">
            <header class="${properties.kcFormHeaderClass!}">
                <div class="damp-mobile-mark" aria-hidden="true">
                    <svg width="36" height="36" viewBox="0 0 48 48"><rect width="48" height="48" rx="14" fill="#0E2463"/><rect x="10" y="14" width="16" height="16" rx="3.5" transform="rotate(45 18 22)" fill="none" stroke="#1FD3E6" stroke-width="3"/><rect x="22" y="18" width="16" height="16" rx="3.5" transform="rotate(45 30 26)" fill="none" stroke="#FFFFFF" stroke-width="3"/></svg>
                    <strong>DAMP</strong>
                </div>

                <#if realm.internationalizationEnabled && locale.supported?size gt 1>
                    <div class="damp-locale" id="kc-locale">
                        <div id="kc-locale-dropdown" class="menu-button-links">
                            <button tabindex="1" id="kc-current-locale-link" aria-label="${msg("languages")}" aria-haspopup="true" aria-expanded="false" aria-controls="language-switch1">${locale.current}</button>
                            <ul role="menu" tabindex="-1" aria-labelledby="kc-current-locale-link" aria-activedescendant="" id="language-switch1">
                                <#assign i = 1>
                                <#list locale.supported as l>
                                    <li role="none"><a role="menuitem" id="language-${i}" href="${l.url}">${l.label}</a></li>
                                    <#assign i++>
                                </#list>
                            </ul>
                        </div>
                    </div>
                </#if>

                <#if !(auth?has_content && auth.showUsername() && !auth.showResetCredentials())>
                    <h1 id="kc-page-title" class="damp-title"><#nested "header"></h1>
                <#else>
                    <#nested "show-username">
                    <h1 id="kc-page-title" class="damp-title"><#nested "header"></h1>
                    <div id="kc-username" class="damp-username">
                        <span class="damp-username-avatar" aria-hidden="true"><#if (auth.attemptedUsername!'')?has_content>${auth.attemptedUsername?substring(0,1)?upper_case}</#if></span>
                        <span id="kc-attempted-username">${auth.attemptedUsername}</span>
                        <a id="reset-login" href="${url.loginRestartFlowUrl}">${msg("restartLoginTooltip")}</a>
                    </div>
                </#if>
                <#if displayRequiredFields>
                    <p class="damp-required-note"><span class="required">*</span> ${msg("requiredFields")}</p>
                </#if>
            </header>

            <div id="kc-content">
                <#-- App-initiated actions don't show warnings about completing the action during login. -->
                <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                    <div class="${properties.kcAlertClass!} damp-alert-${message.type}" role="<#if message.type = 'error' || message.type = 'warning'>alert<#else>status</#if>">
                        <span class="damp-alert-icon" aria-hidden="true"></span>
                        <span class="${properties.kcAlertTitleClass!}">${kcSanitize(message.summary)?no_esc}</span>
                    </div>
                </#if>

                <#nested "form">

                <#if auth?has_content && auth.showTryAnotherWayLink()>
                    <form id="kc-select-try-another-way-form" action="${url.loginAction}" method="post" class="damp-try-another">
                        <input type="hidden" name="tryAnotherWay" value="on"/>
                        <button type="submit" class="damp-link-btn">${msg("doTryAnotherWay")}</button>
                    </form>
                </#if>

                <#nested "socialProviders">

                <#if displayInfo>
                    <div id="kc-info" class="${properties.kcSignUpClass!}">
                        <div id="kc-info-wrapper" class="${properties.kcInfoAreaWrapperClass!}">
                            <#nested "info">
                        </div>
                    </div>
                </#if>
            </div>

            <footer class="damp-footer">
                <p class="damp-secure"><span class="damp-icon-lock" aria-hidden="true"></span>${msg("damp.secure")}</p>
                <p>${msg("damp.legal")}</p>
                <@loginFooter.content/>
            </footer>
        </div>
    </main>
</div>
</body>
</html>
</#macro>
