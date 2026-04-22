#pragma once
#include "Settings.h"

#include "NapiHelper.h"

namespace BrowserApiTilted {
Napi::Value SetVisible(const Napi::CallbackInfo& info);
Napi::Value IsVisibleJS(const Napi::CallbackInfo& info);
bool IsVisible();
Napi::Value SetFocused(const Napi::CallbackInfo& info);
Napi::Value IsFocused(const Napi::CallbackInfo& info);
Napi::Value LoadUrl(const Napi::CallbackInfo& info);
Napi::Value ExecuteJavaScript(const Napi::CallbackInfo& info);
Napi::Value EmitEvent(const Napi::CallbackInfo& info);
Napi::Value SetMediaPermissionPolicy(const Napi::CallbackInfo& info);
}
