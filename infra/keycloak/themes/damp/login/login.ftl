<#import "template.ftl" as layout>
<#-- The Ops Console (damp-ops) gets a staff variant: staff accounts are issued
     by an administrator, so it never offers self-registration. -->
<#assign staffLogin = (client?? && client.clientId == "damp-ops")>
<#assign canRegister = (realm.password && realm.registrationAllowed && !registrationDisabled?? && !staffLogin)>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=(canRegister || staffLogin); section>
    <#if section = "header">
        <#if staffLogin>${msg("damp.staff.title")}<#else>${msg("loginAccountTitle")}</#if>
    <#elseif section = "form">
        <#if staffLogin>
            <p class="damp-subtitle">${msg("damp.staff.subtitle")}</p>
        <#elseif canRegister>
            <p class="damp-subtitle">${msg("noAccount")} <a href="${url.registrationUrl}">${msg("doRegister")}</a></p>
        </#if>
        <#if realm.password>
            <form id="kc-form-login" class="${properties.kcFormClass!}" onsubmit="login.disabled = true; login.setAttribute('aria-busy','true'); return true;" action="${url.loginAction}" method="post" novalidate>
                <#if !usernameHidden??>
                    <div class="${properties.kcFormGroupClass!}">
                        <label for="username" class="${properties.kcLabelClass!}"><#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if></label>
                        <input tabindex="2" id="username" class="${properties.kcInputClass!}" name="username" value="${(login.username!'')}" type="text" autofocus autocomplete="username" inputmode="email" placeholder="you@example.com" dir="ltr"
                               aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
                               <#if messagesPerField.existsError('username','password')>aria-describedby="input-error"</#if>/>
                        <#if messagesPerField.existsError('username','password')>
                            <span id="input-error" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}</span>
                        </#if>
                    </div>
                </#if>

                <div class="${properties.kcFormGroupClass!}">
                    <div class="damp-label-row">
                        <label for="password" class="${properties.kcLabelClass!}">${msg("password")}</label>
                        <#if realm.resetPasswordAllowed>
                            <a tabindex="6" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
                        </#if>
                    </div>
                    <div class="${properties.kcInputGroup!}" dir="ltr">
                        <input tabindex="3" id="password" class="${properties.kcInputClass!}" name="password" type="password" autocomplete="current-password"
                               aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"/>
                        <button class="${properties.kcFormPasswordVisibilityButtonClass!}" type="button" aria-label="${msg('showPassword')}" aria-controls="password" aria-pressed="false" data-password-toggle tabindex="4"
                                data-icon-show="${properties.kcFormPasswordVisibilityIconShow!}" data-icon-hide="${properties.kcFormPasswordVisibilityIconHide!}"
                                data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}">
                            <i class="${properties.kcFormPasswordVisibilityIconShow!}" aria-hidden="true"></i>
                        </button>
                    </div>
                    <#if usernameHidden?? && messagesPerField.existsError('username','password')>
                        <span id="input-error" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}</span>
                    </#if>
                </div>

                <#if realm.rememberMe && !usernameHidden??>
                    <label class="damp-check">
                        <input tabindex="5" id="rememberMe" name="rememberMe" type="checkbox" <#if login.rememberMe??>checked</#if>>
                        <span>${msg("rememberMe")}</span>
                    </label>
                </#if>

                <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
                    <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>
                    <button tabindex="7" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!} damp-btn-arrow" name="login" id="kc-login" type="submit">${msg("doLogIn")}</button>
                </div>
            </form>
        </#if>
        <script type="module" src="${url.resourcesPath}/js/passwordVisibility.js"></script>
    <#elseif section = "info">
        <#if staffLogin>
            <p class="damp-note">${msg("damp.staff.note")}</p>
        <#elseif canRegister>
            <p id="kc-registration" class="damp-note">${msg("damp.register.business")}</p>
        </#if>
    <#elseif section = "socialProviders">
        <#if realm.password && social?? && social.providers?has_content>
            <div id="kc-social-providers" class="${properties.kcFormSocialAccountSectionClass!}">
                <div class="damp-divider" role="separator"><span>${msg("identity-provider-login-label")}</span></div>
                <ul class="${properties.kcFormSocialAccountListClass!}">
                    <#list social.providers as p>
                        <li><a id="social-${p.alias}" class="${properties.kcFormSocialAccountListButtonClass!}" href="${p.loginUrl}"><span class="${properties.kcFormSocialAccountNameClass!}">${p.displayName!}</span></a></li>
                    </#list>
                </ul>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>
