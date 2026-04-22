#include "BrowserApiNirnLab.h"

#include <fmt/format.h>
#include <NirnLabUIPlatformAPI/API.h>
#include <NirnLabUIPlatformAPI/DllLoader.h>
#include <NirnLabUIPlatformAPI/SKSELoader.h>

#include <stdexcept>

#include "EventsApi.h"
#include "NapiHelper.h"
#include "SkyrimPlatform.h"

namespace {
std::string DescribeBrowserState(NL::CEF::IBrowser* browser)
{
  if (!browser) {
    return "browser=null";
  }

  return fmt::format("browserReady={} pageLoaded={}",
                     browser->IsBrowserReady(), browser->IsPageLoaded());
}

void LogDeferredAction(const char* action, const std::string& detail)
{
  logger::info("BrowserApiNirnLab {} deferred: {}", action, detail);
}

bool ParseSecureOriginAudioCaptureEnabled(const std::string& policy)
{
  if (policy == "default") {
    return false;
  }
  if (policy == "secureOriginAudioCapture") {
    return true;
  }

  throw std::runtime_error("Unknown browser media permission policy: " +
                           policy);
}

constexpr auto kBrowserEventRegistrarObjectName = "skyrimPlatform";
constexpr auto kBrowserEventRegistrarFuncName = "addEventListener";
}

void BrowserApiNirnLab::HandleSkseMessage(
  SKSE::MessagingInterface::Message* a_msg)
{
  logger::info("BrowserApiNirnLab handling SKSE message type {} ({})",
               a_msg->type, DescribeBrowserState(browser));
  auto settings = BuildSettings();
  NL::UI::SKSELoader::ProcessSKSEMessage(a_msg, &settings);
}

BrowserApiNirnLab::BrowserApiNirnLab()
{
  logger::info("BrowserApiNirnLab waiting for NirnLab UI Platform API");
  NL::UI::SKSELoader::GetUIPlatformAPIWithVersionCheck(
    [](NL::UI::IUIPlatformAPI* receivedApi) {
      auto& self = GetInstance();
      logger::info("BrowserApiNirnLab received NirnLab UI Platform API {}",
                   static_cast<const void*>(receivedApi));
      self.api = receivedApi;
      self.ApiInit();
    });
}

BrowserApiNirnLab& BrowserApiNirnLab::GetInstance()
{
  static BrowserApiNirnLab g_inst;
  return g_inst;
}

Napi::Value BrowserApiNirnLab::SetVisible(const Napi::CallbackInfo& info)
{
  wantedIsVisible = NapiHelper::ExtractBoolean(info[0], "isVisible");
  logger::info("BrowserApiNirnLab SetVisible {} ({})", wantedIsVisible,
               DescribeBrowserState(browser));
  UpdateVisible();
  return info.Env().Undefined();
}

Napi::Value BrowserApiNirnLab::IsVisible(const Napi::CallbackInfo& info)
{
  return Napi::Boolean::New(info.Env(), wantedIsVisible);
}

bool BrowserApiNirnLab::IsVisible()
{
  return wantedIsVisible;
}

Napi::Value BrowserApiNirnLab::SetFocused(const Napi::CallbackInfo& info)
{
  wantedIsFocused = NapiHelper::ExtractBoolean(info[0], "isFocused");
  logger::info("BrowserApiNirnLab SetFocused {} ({})", wantedIsFocused,
               DescribeBrowserState(browser));
  UpdateFocused();
  return info.Env().Undefined();
}

Napi::Value BrowserApiNirnLab::IsFocused(const Napi::CallbackInfo& info)
{
  return Napi::Boolean::New(info.Env(), wantedIsFocused);
}

Napi::Value BrowserApiNirnLab::LoadUrl(const Napi::CallbackInfo& info)
{
  wantedUrl = NapiHelper::ExtractString(info[0], "url");
  logger::info("BrowserApiNirnLab LoadUrl '{}' ({})", wantedUrl,
               DescribeBrowserState(browser));
  UpdateUrl();
  return Napi::Boolean::New(info.Env(), true);
}

Napi::Value BrowserApiNirnLab::ExecuteJavaScript(
  const Napi::CallbackInfo& info)
{
  auto src = NapiHelper::ExtractString(info[0], "src");
  {
    auto d = src.substr(0, 120);
    for (char& c : d) {
      if (c == '\n') {
        c = ' ';
      }
    }
    logger::info("BrowserApiNirnLab queue JS {} ... ({})", d,
                 DescribeBrowserState(browser));
  }
  jsExecQueue.push_back(src);
  UpdateJs();
  return info.Env().Undefined();
}

Napi::Value BrowserApiNirnLab::EmitEvent(const Napi::CallbackInfo& info)
{
  auto eventName = NapiHelper::ExtractString(info[0], "eventName");
  auto dataJson = NapiHelper::ExtractString(info[1], "dataJson");
  logger::info("BrowserApiNirnLab queue event '{}' ({})", eventName,
               DescribeBrowserState(browser));
  eventExecQueue.push_back({ eventName, dataJson });
  UpdateEvents();
  return info.Env().Undefined();
}

Napi::Value BrowserApiNirnLab::SetMediaPermissionPolicy(
  const Napi::CallbackInfo& info)
{
  const auto policy = NapiHelper::ExtractString(info[0], "policy");
  secureOriginAudioCaptureEnabled =
    ParseSecureOriginAudioCaptureEnabled(policy);
  logger::info(
    "BrowserApiNirnLab SetMediaPermissionPolicy '{}' ({})", policy,
    DescribeBrowserState(browser));
  ApplySettings();
  return info.Env().Undefined();
}

NL::UI::Settings BrowserApiNirnLab::BuildSettings() const
{
  NL::UI::Settings settings{};
  settings.remoteDebuggingPort = 9000;
  settings.mediaAccessPermissionPolicy =
    secureOriginAudioCaptureEnabled
      ? NL::UI::MediaAccessPermissionPolicy::SecureOriginAudioCapture
      : NL::UI::MediaAccessPermissionPolicy::Default;
  return settings;
}

void BrowserApiNirnLab::ApplySettings()
{
  if (api == nullptr) {
    LogDeferredAction(
      "SetMediaPermissionPolicy",
      fmt::format("secureOriginAudioCaptureEnabled={} because api is not ready",
                  secureOriginAudioCaptureEnabled));
    return;
  }

  NL::UI::IUIPlatformAPI* refreshedApi = nullptr;
  auto settings = BuildSettings();

  try {
    if (!NL::UI::DllLoader::CreateOrGetUIPlatformAPI(&refreshedApi,
                                                     &settings)) {
      logger::error(
        "BrowserApiNirnLab failed to refresh NirnLab settings for policy "
        "update");
      return;
    }
  } catch (const std::exception& e) {
    logger::error(
      "BrowserApiNirnLab exception while refreshing NirnLab settings: {}",
      e.what());
    return;
  }

  if (refreshedApi != nullptr) {
    api = refreshedApi;
  }

  logger::info(
    "BrowserApiNirnLab applied media permission policy "
    "secureOriginAudioCaptureEnabled={}",
    secureOriginAudioCaptureEnabled);
}

void BrowserApiNirnLab::UpdateVisible()
{
  if (!browser) {
    LogDeferredAction(
      "SetVisible",
      fmt::format("wantedIsVisible={} because {}", wantedIsVisible,
                  DescribeBrowserState(browser)));
    return;
  }
  logger::info("BrowserApiNirnLab applying visibility {} ({})",
               wantedIsVisible, DescribeBrowserState(browser));
  browser->SetBrowserVisible(wantedIsVisible);
}

void BrowserApiNirnLab::UpdateFocused()
{
  if (!browser) {
    LogDeferredAction(
      "SetFocused",
      fmt::format("wantedIsFocused={} because {}", wantedIsFocused,
                  DescribeBrowserState(browser)));
    return;
  }
  logger::info("BrowserApiNirnLab applying focus {} ({})", wantedIsFocused,
               DescribeBrowserState(browser));
  browser->SetBrowserFocused(wantedIsFocused);
}

void BrowserApiNirnLab::UpdateUrl()
{
  if (!browser) {
    LogDeferredAction(
      "LoadUrl",
      fmt::format("wantedUrl='{}' because {}", wantedUrl,
                  DescribeBrowserState(browser)));
    return;
  }
  logger::info("BrowserApiNirnLab applying url '{}' ({})", wantedUrl,
               DescribeBrowserState(browser));
  browser->LoadBrowserURL(wantedUrl.c_str(), false);
}

void BrowserApiNirnLab::UpdateJs()
{
  if (!browser) {
    LogDeferredAction(
      "ExecuteJavaScript",
      fmt::format("queued={} because {}", jsExecQueue.size(),
                  DescribeBrowserState(browser)));
    return;
  }
  while (!jsExecQueue.empty()) {
    logger::info("BrowserApiNirnLab executing queued JS ({})",
                 DescribeBrowserState(browser));
    browser->ExecuteJavaScript(jsExecQueue.front().c_str());
    jsExecQueue.pop_front();
  }
}

void BrowserApiNirnLab::UpdateEvents()
{
  if (!browser) {
    LogDeferredAction(
      "EmitEvent",
      fmt::format("queued={} because {}", eventExecQueue.size(),
                  DescribeBrowserState(browser)));
    return;
  }

  while (!eventExecQueue.empty()) {
    if (!browser->IsPageLoaded()) {
      LogDeferredAction(
        "EmitEvent",
        fmt::format("queued={} because {}", eventExecQueue.size(),
                    DescribeBrowserState(browser)));
      return;
    }

    logger::info("BrowserApiNirnLab emitting queued event '{}' ({})",
                 eventExecQueue.front().first, DescribeBrowserState(browser));
    browser->ExecEventFunction(eventExecQueue.front().first.c_str(),
                               eventExecQueue.front().second.c_str());
    eventExecQueue.pop_front();
  }
}

void BrowserApiNirnLab::UpdateAll()
{
  UpdateVisible();
  UpdateFocused();
  UpdateUrl();
  UpdateJs();
  UpdateEvents();
}

void BrowserApiNirnLab::ApiInit()
{
  if (api == nullptr) {
    throw std::runtime_error(
      "BrowserApiNirnLab::ApiInit: api must not be null here");
  }

  NL::JS::JSFuncInfo callback{
    .objectName = "skyrimPlatform",
    .funcName = "sendMessage",
    .callbackData = {
      .callback = [](const char** a_args, int a_argsCount) {
        std::vector<std::string> args{a_args, a_args + a_argsCount};
        SkyrimPlatform::GetSingleton()->AddTickTask(
          [args = std::move(args)](Napi::Env env) {
            auto argumentsArray = Napi::Array::New(env, args.size());
            for (uint32_t i = 0; i < args.size(); ++i) {
              argumentsArray.Set(i, NapiHelper::ParseJson(env, args[i]));
            }

            auto browserMessageEvent = Napi::Object::New(env);
            browserMessageEvent.Set("arguments", argumentsArray);
            EventsApi::SendEvent("browserMessage", { browserMessageEvent });
          });
      },
      .executeInGameThread = true,
      .isEventFunction = false,
    },
  };
  auto callbackPtr = &callback;

  NL::JS::JSFuncInfo eventCallback{
    .objectName = kBrowserEventRegistrarObjectName,
    .funcName = kBrowserEventRegistrarFuncName,
    .callbackData =
      {
        .callback = nullptr,
        .executeInGameThread = true,
        .isEventFunction = true,
      },
  };
  auto eventCallbackPtr = &eventCallback;

  NL::JS::JSFuncInfo* callbacks[] = { callbackPtr, eventCallbackPtr };

  constexpr auto kNirnlabBrowserName = "SkyrimPlatform_Default";

  logger::info("BrowserApiNirnLab ApiInit starting browser='{}' wantedUrl='{}' "
               "wantedVisible={} wantedFocused={}",
               kNirnlabBrowserName, wantedUrl, wantedIsVisible,
               wantedIsFocused);

  const NL::UI::IUIPlatformAPI::BrowserRefHandle browserHandle =
    api->AddOrGetBrowser(kNirnlabBrowserName, callbacks, 2,
                         "file:///Data/Platform/UI/index.html", browser);
  if (browserHandle == NL::UI::IUIPlatformAPI::InvalidBrowserRefHandle) {
    logger::error("browser init failed: InvalidBrowserRefHandle");
    return;
  }
  if (!browser) {
    logger::error("browser init failed: browser is nullptr");
    return;
  }

  logger::info("BrowserApiNirnLab ApiInit acquired handle={} ({})",
               browserHandle, DescribeBrowserState(browser));
  UpdateAll();
  logger::info("BrowserApiNirnLab ApiInit completed ({})",
               DescribeBrowserState(browser));
}
