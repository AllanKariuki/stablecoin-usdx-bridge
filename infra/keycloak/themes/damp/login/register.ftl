<#import "template.ftl" as layout>
<#import "user-profile-commons.ftl" as userProfileCommons>
<#import "register-commons.ftl" as registerCommons>
<#--
  Fields come from the realm's declarative user profile (user-profile-commons),
  so adding an attribute there shows up here with no template change. The
  password pair is inserted right after the email field, as in base.
-->
<@layout.registrationLayout displayMessage=messagesPerField.exists('global') displayRequiredFields=false; section>
    <#if section = "header">
        <#if messageHeader??>${kcSanitize(msg("${messageHeader}"))?no_esc}<#else>${msg("registerTitle")}</#if>
    <#elseif section = "form">
        <p class="damp-subtitle">${msg("damp.register.lede")}</p>
        <form id="kc-register-form" class="${properties.kcFormClass!} damp-register" action="${url.registrationAction}" method="post" novalidate onsubmit="var b=document.getElementById('kc-register'); if (b) { b.disabled = true; b.setAttribute('aria-busy','true'); } return true;">
            <@userProfileCommons.userProfileFormFields; callback, attribute>
                <#if callback = "afterField">
                    <#if passwordRequired?? && (attribute.name == 'username' || (attribute.name == 'email' && realm.registrationEmailAsUsername))>
                        <div class="${properties.kcFormGroupClass!}">
                            <label for="password" class="${properties.kcLabelClass!}">${msg("password")} <span class="required" aria-hidden="true">*</span></label>
                            <div class="${properties.kcInputGroup!}" dir="ltr">
                                <input type="password" id="password" class="${properties.kcInputClass!}" name="password" autocomplete="new-password" required aria-describedby="password-hint<#if messagesPerField.existsError('password')> input-error-password</#if>"
                                       aria-invalid="<#if messagesPerField.existsError('password','password-confirm')>true</#if>"/>
                                <button class="${properties.kcFormPasswordVisibilityButtonClass!}" type="button" aria-label="${msg('showPassword')}" aria-controls="password" aria-pressed="false" data-password-toggle
                                        data-icon-show="${properties.kcFormPasswordVisibilityIconShow!}" data-icon-hide="${properties.kcFormPasswordVisibilityIconHide!}"
                                        data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}">
                                    <i class="${properties.kcFormPasswordVisibilityIconShow!}" aria-hidden="true"></i>
                                </button>
                            </div>
                            <span id="password-hint" class="damp-hint">${msg("damp.password.hint")}</span>
                            <#if messagesPerField.existsError('password')>
                                <span id="input-error-password" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">${kcSanitize(messagesPerField.get('password'))?no_esc}</span>
                            </#if>
                        </div>

                        <div class="${properties.kcFormGroupClass!}">
                            <label for="password-confirm" class="${properties.kcLabelClass!}">${msg("passwordConfirm")} <span class="required" aria-hidden="true">*</span></label>
                            <div class="${properties.kcInputGroup!}" dir="ltr">
                                <input type="password" id="password-confirm" class="${properties.kcInputClass!}" name="password-confirm" autocomplete="new-password" required
                                       aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>"
                                       <#if messagesPerField.existsError('password-confirm')>aria-describedby="input-error-password-confirm"</#if>/>
                                <button class="${properties.kcFormPasswordVisibilityButtonClass!}" type="button" aria-label="${msg('showPassword')}" aria-controls="password-confirm" aria-pressed="false" data-password-toggle
                                        data-icon-show="${properties.kcFormPasswordVisibilityIconShow!}" data-icon-hide="${properties.kcFormPasswordVisibilityIconHide!}"
                                        data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}">
                                    <i class="${properties.kcFormPasswordVisibilityIconShow!}" aria-hidden="true"></i>
                                </button>
                            </div>
                            <#if messagesPerField.existsError('password-confirm')>
                                <span id="input-error-password-confirm" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}</span>
                            </#if>
                        </div>
                    </#if>
                </#if>
            </@userProfileCommons.userProfileFormFields>

            <@registerCommons.termsAcceptance/>

            <#if recaptchaRequired?? && (recaptchaVisible!false)>
                <div class="${properties.kcFormGroupClass!}">
                    <div class="g-recaptcha" data-size="compact" data-sitekey="${recaptchaSiteKey}" data-action="${recaptchaAction}"></div>
                </div>
            </#if>

            <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
                <#if recaptchaRequired?? && !(recaptchaVisible!false)>
                    <script>function onSubmitRecaptcha() { document.getElementById("kc-register-form").requestSubmit(); }</script>
                    <button id="kc-register" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!} damp-btn-arrow g-recaptcha" data-sitekey="${recaptchaSiteKey}" data-callback="onSubmitRecaptcha" data-action="${recaptchaAction}" type="submit">${msg("doRegister")}</button>
                <#else>
                    <button id="kc-register" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!} damp-btn-arrow" type="submit">${msg("doRegister")}</button>
                </#if>
            </div>

            <p class="damp-subtitle damp-center"><a href="${url.loginUrl}">${kcSanitize(msg("backToLogin"))?no_esc}</a></p>
            <p class="damp-note">${msg("damp.register.business")}</p>
        </form>
        <script type="module" src="${url.resourcesPath}/js/passwordVisibility.js"></script>
    </#if>
</@layout.registrationLayout>
