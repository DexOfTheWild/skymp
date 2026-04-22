#include <NirnLabUIPlatformAPI/API.h>

#include "BrowserApiTilted.h"
#include "NullPointerException.h"
#include "TPOverlayService.h"

#include <stdexcept>

namespace {

thread_local bool g_cursorIsOpenByFocus = false;

bool ParseSecureOriginAudioCaptureEnabled(const std::string& policy)
{
  if (policy == "default") {
    return false;
  }
  if (policy == "secureOriginAudioCapture") {
    return true;
  }

  throw std::runtime_error("Unknown browser media permission policy: " + policy);
}

inline CEFUtils::MyChromiumApp& GetApp()
{
  auto overlayService = OverlayService::GetInstance();
  if (!overlayService) {
    throw NullPointerException("overlayService");
  }

  auto app = overlayService->GetMyChromiumApp();
  if (!app) {
    throw NullPointerException("app");
  }

  return *app;
}
}

Napi::Value BrowserApiTilted::SetVisible(const Napi::CallbackInfo& info)
{
  bool& v = CEFUtils::DX11RenderHandler::Visible();
  v = NapiHelper::ExtractBoolean(info[0], "visible");
  return info.Env().Undefined();
}

Napi::Value BrowserApiTilted::IsVisibleJS(const Napi::CallbackInfo& info)
{
  return Napi::Boolean::New(info.Env(), IsVisible());
}

bool BrowserApiTilted::IsVisible()
{
  return CEFUtils::DX11RenderHandler::Visible();
}

Napi::Value BrowserApiTilted::SetFocused(const Napi::CallbackInfo& info)
{
  bool& v = CEFUtils::DInputHook::ChromeFocus();
  bool newFocus = NapiHelper::ExtractBoolean(info[0], "focused");
  if (v != newFocus) {
    v = newFocus;

    auto ui = RE::UI::GetSingleton();
    auto msgQ = RE::UIMessageQueue::GetSingleton();

    if (!ui || !msgQ) {
      return info.Env().Undefined();
    }

    const bool alreadyOpen = ui->IsMenuOpen(RE::CursorMenu::MENU_NAME);

    if (newFocus) {
      if (!alreadyOpen) {
        msgQ->AddMessage(RE::CursorMenu::MENU_NAME, RE::UI_MESSAGE_TYPE::kShow,
                         NULL);
        g_cursorIsOpenByFocus = true;
      }
    } else {
      if (g_cursorIsOpenByFocus) {
        msgQ->AddMessage(RE::CursorMenu::MENU_NAME, RE::UI_MESSAGE_TYPE::kHide,
                         NULL);
        g_cursorIsOpenByFocus = false;
      }
    }
  }
  return info.Env().Undefined();
}

Napi::Value BrowserApiTilted::IsFocused(const Napi::CallbackInfo& info)
{
  return Napi::Boolean::New(info.Env(), CEFUtils::DInputHook::ChromeFocus());
}

Napi::Value BrowserApiTilted::LoadUrl(const Napi::CallbackInfo& info)
{
  auto str = NapiHelper::ExtractString(info[0], "url");
  return Napi::Boolean::New(info.Env(), GetApp().LoadUrl(str.data()));
}

Napi::Value BrowserApiTilted::GetToken(const Napi::CallbackInfo& info)
{
  return Napi::String::New(info.Env(), MyChromiumApp::GetCurrentSpToken());
}

Napi::Value BrowserApiTilted::ExecuteJavaScript(const Napi::CallbackInfo& info)
{
  auto str = NapiHelper::ExtractString(info[0], "src");
  GetApp().ExecuteJavaScript(str);
  return info.Env().Undefined();
}

Napi::Value BrowserApiTilted::EmitEvent(const Napi::CallbackInfo& info)
{
  auto eventName = NapiHelper::ExtractString(info[0], "eventName");
  auto dataJson = NapiHelper::ExtractString(info[1], "dataJson");

  auto eventNameLiteral = nlohmann::json(eventName).dump();
  auto dataJsonLiteral = nlohmann::json(dataJson).dump();
  auto script =
    std::string("(function(){") + "const eventName=" + eventNameLiteral +
    ";" + "const rawData=" + dataJsonLiteral + ";" +
    "let parsedData=rawData;" +
    "try{parsedData=JSON.parse(rawData);}catch(_err){}" +
    "window.dispatchEvent(new CustomEvent('skymp-browser-event',{detail:{eventName:eventName,data:parsedData}}));" +
    "})();";

  GetApp().ExecuteJavaScript(script);
  return info.Env().Undefined();
}

Napi::Value BrowserApiTilted::SetMediaPermissionPolicy(
  const Napi::CallbackInfo& info)
{
  const auto policy = NapiHelper::ExtractString(info[0], "policy");
  CEFUtils::OverlayClient::SetSecureOriginAudioCaptureEnabled(
    ParseSecureOriginAudioCaptureEnabled(policy));
  return info.Env().Undefined();
}
