#pragma once

#include <deque>
#include <memory>
#include <string>
#include <utility>

namespace NL::UI {
class IUIPlatformAPI;
struct Settings;
}

namespace NL::CEF {
class IBrowser;
}

class BrowserApiNirnLab
{
public:
  void HandleSkseMessage(SKSE::MessagingInterface::Message* a_msg);
  static BrowserApiNirnLab& GetInstance();

  Napi::Value SetVisible(const Napi::CallbackInfo& info);
  Napi::Value IsVisible(const Napi::CallbackInfo& info);
  bool IsVisible();
  Napi::Value SetFocused(const Napi::CallbackInfo& info);
  Napi::Value IsFocused(const Napi::CallbackInfo& info);
  Napi::Value LoadUrl(const Napi::CallbackInfo& info);
  Napi::Value GetToken(const Napi::CallbackInfo& info);
  Napi::Value ExecuteJavaScript(const Napi::CallbackInfo& info);
  Napi::Value EmitEvent(const Napi::CallbackInfo& info);
  Napi::Value SetMediaPermissionPolicy(const Napi::CallbackInfo& info);

private:
  BrowserApiNirnLab();

  NL::UI::Settings BuildSettings() const;
  void ApplySettings();
  void UpdateVisible();
  void UpdateFocused();
  void UpdateUrl();
  void UpdateJs();
  void UpdateEvents();
  void UpdateAll();
  void ApiInit();

  NL::UI::IUIPlatformAPI* api = nullptr;
  NL::CEF::IBrowser* browser = nullptr;
  bool wantedIsVisible = false;
  bool wantedIsFocused = false;
  bool secureOriginAudioCaptureEnabled = false;
  std::string wantedUrl;
  std::deque<std::string> jsExecQueue;
  std::deque<std::pair<std::string, std::string>> eventExecQueue;

  static std::unique_ptr<BrowserApiNirnLab> g_instance;
};
