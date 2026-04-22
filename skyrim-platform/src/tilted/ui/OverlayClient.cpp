#include "../ui/TextToDraw.h"
#include <Filesystem.hpp>
#include <MyCtxHandler.h>
#include <OverlayClient.h>
#include <filesystem>
#include <functional>
#include <spdlog/spdlog.h>
#include <string>

#include <include/internal/cef_types.h>

EXTERN_C IMAGE_DOS_HEADER __ImageBase;

namespace CEFUtils {
namespace {
bool IsSecureEnoughForAutoMic(const std::string& url)
{
  return url.rfind("https://", 0) == 0 ||
    url.rfind("http://localhost", 0) == 0 ||
    url.rfind("http://127.0.0.1", 0) == 0;
}
}

std::atomic_bool OverlayClient::s_secureOriginAudioCaptureEnabled = false;

OverlayClient::OverlayClient(
  MyRenderHandler* apHandler,
  std::shared_ptr<ProcessMessageListener> onProcessMessage_) noexcept
  : m_pRenderHandler(apHandler)
  , m_pLoadHandler(new MyLoadHandler)
  , m_pBrowser(nullptr)
  , m_pContextMenuHandler(new MyCtxHandler)
  , onProcessMessage(onProcessMessage_)
{
  const auto currentPath = CEFUtils::GetPath();

  m_cursorPathPNG =
    (currentPath / "assets" / "images" / "cursor.png").wstring();
  m_cursorPathDDS =
    (currentPath / "assets" / "images" / "cursor.dds").wstring();

  apHandler->SetParent(this);
}

CefRefPtr<MyRenderHandler> OverlayClient::GetMyRenderHandler()
{
  return m_pRenderHandler;
}

CefRefPtr<CefRenderHandler> OverlayClient::GetRenderHandler()
{
  return m_pRenderHandler;
}

CefRefPtr<CefLoadHandler> OverlayClient::GetLoadHandler()
{
  return m_pLoadHandler;
}

CefRefPtr<CefLifeSpanHandler> OverlayClient::GetLifeSpanHandler()
{
  return this;
}

CefRefPtr<CefContextMenuHandler> OverlayClient::GetContextMenuHandler()
{
  return m_pContextMenuHandler;
}

CefRefPtr<CefPermissionHandler> OverlayClient::GetPermissionHandler()
{
  return this;
}

void OverlayClient::SetSecureOriginAudioCaptureEnabled(bool enabled) noexcept
{
  s_secureOriginAudioCaptureEnabled.store(enabled, std::memory_order_relaxed);
}

bool OverlayClient::IsSecureOriginAudioCaptureEnabled() noexcept
{
  return s_secureOriginAudioCaptureEnabled.load(std::memory_order_relaxed);
}

void OverlayClient::SetBrowser(const CefRefPtr<CefBrowser>& aBrowser) noexcept
{
  m_pBrowser = aBrowser;
}

CefRefPtr<CefBrowser> OverlayClient::GetBrowser() const noexcept
{
  return m_pBrowser;
}

const std::wstring& OverlayClient::GetCursorPathPNG() const noexcept
{
  return m_cursorPathPNG;
}

const std::wstring& OverlayClient::GetCursorPathDDS() const noexcept
{
  return m_cursorPathDDS;
}

void OverlayClient::Create() const noexcept
{
  if (m_pRenderHandler)
    m_pRenderHandler->Create();
}

void OverlayClient::Render(
  const ObtainTextsToDrawFunction& obtainTextsToDraw) const noexcept
{
  if (m_pRenderHandler) {
    m_pRenderHandler->Render(obtainTextsToDraw);
  }
}

void OverlayClient::Reset() const noexcept
{
  if (m_pRenderHandler)
    m_pRenderHandler->Reset();
}

void OverlayClient::OnAfterCreated(CefRefPtr<CefBrowser> aBrowser)
{
  SetBrowser(aBrowser);
}

void OverlayClient::OnBeforeClose(CefRefPtr<CefBrowser> aBrowser)
{
  SetBrowser(nullptr);
}

bool OverlayClient::OnProcessMessageReceived(
  CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
  CefProcessId source_process, CefRefPtr<CefProcessMessage> message)
{
  if (message->GetName() == "ui-event") {
    auto pArguments = message->GetArgumentList();

    auto eventName = pArguments->GetString(0).ToString();
    auto eventArgs = pArguments->GetList(1);

    onProcessMessage->OnProcessMessage(eventName, eventArgs);

    return true;
  }

  return false;
}

bool OverlayClient::OnRequestMediaAccessPermission(
  CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
  const CefString& requesting_origin, uint32 requested_permissions,
  CefRefPtr<CefMediaAccessCallback> callback)
{
  const auto origin = requesting_origin.ToString();
  const auto currentUrl =
    frame ? frame->GetURL().ToString()
          : browser ? browser->GetMainFrame()->GetURL().ToString() : "";
  const auto secureUrlToCheck = !origin.empty() ? origin : currentUrl;

  const bool wantsAudio =
    (requested_permissions & CEF_MEDIA_PERMISSION_DEVICE_AUDIO_CAPTURE) != 0;
  const bool wantsOtherCapture =
    (requested_permissions & ~CEF_MEDIA_PERMISSION_DEVICE_AUDIO_CAPTURE) != 0;
  const bool secureOriginAudioCaptureEnabled =
    IsSecureOriginAudioCaptureEnabled();
  const bool allowAudioCapture = secureOriginAudioCaptureEnabled && wantsAudio &&
    !wantsOtherCapture && IsSecureEnoughForAutoMic(secureUrlToCheck);

  spdlog::info(
    "browser (tilted): media permission request origin='{}' url='{}' perms={} "
    "secureOriginAudioCaptureEnabled={} allowAudioCapture={}",
    origin, currentUrl, requested_permissions,
    secureOriginAudioCaptureEnabled, allowAudioCapture);

  if (allowAudioCapture) {
    callback->Continue(CEF_MEDIA_PERMISSION_DEVICE_AUDIO_CAPTURE);
  } else {
    callback->Cancel();
  }

  return true;
}

bool OverlayClient::IsReady() const
{
  return m_pBrowser && m_pLoadHandler->IsReady();
}
}
