#pragma once

#include "MyLoadHandler.h"
#include "MyRenderHandler.h"
#include "ProcessMessageListener.h"
#include "TextToDraw.h"
#include <atomic>
#include <Meta.hpp>
#include <functional>
#include <include/cef_client.h>
#include <include/cef_permission_handler.h>

namespace CEFUtils {
struct OverlayClient
  : CefClient
  , CefLifeSpanHandler
  , CefContextMenuHandler
  , CefPermissionHandler
{
  explicit OverlayClient(
    MyRenderHandler* apHandler,
    std::shared_ptr<ProcessMessageListener> onProcessMessage_) noexcept;

  TP_NOCOPYMOVE(OverlayClient);

  [[nodiscard]] CefRefPtr<MyRenderHandler> GetMyRenderHandler();
  CefRefPtr<CefRenderHandler> GetRenderHandler() override;
  CefRefPtr<CefLoadHandler> GetLoadHandler() override;
  CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() override;
  CefRefPtr<CefContextMenuHandler> GetContextMenuHandler() override;
  CefRefPtr<CefPermissionHandler> GetPermissionHandler() override;
  static void SetSecureOriginAudioCaptureEnabled(bool enabled) noexcept;
  static bool IsSecureOriginAudioCaptureEnabled() noexcept;

  [[nodiscard]] CefRefPtr<CefBrowser> GetBrowser() const noexcept;
  [[nodiscard]] const std::wstring& GetCursorPathPNG() const noexcept;
  [[nodiscard]] const std::wstring& GetCursorPathDDS() const noexcept;

  void Render(
    const ObtainTextsToDrawFunction& obtainTextsToDraw) const noexcept;
  void Create() const noexcept;
  void Reset() const noexcept;

  void OnAfterCreated(CefRefPtr<CefBrowser> aBrowser) override;
  void OnBeforeClose(CefRefPtr<CefBrowser> aBrowser) override;
  bool OnProcessMessageReceived(CefRefPtr<CefBrowser> browser,
                                CefRefPtr<CefFrame> frame,
                                CefProcessId source_process,
                                CefRefPtr<CefProcessMessage> message) override;
  bool OnRequestMediaAccessPermission(
    CefRefPtr<CefBrowser> browser,
    CefRefPtr<CefFrame> frame,
    const CefString& requesting_origin,
    uint32 requested_permissions,
    CefRefPtr<CefMediaAccessCallback> callback) override;

  bool IsReady() const;

  IMPLEMENT_REFCOUNTING(OverlayClient);

private:
  void SetBrowser(const CefRefPtr<CefBrowser>& aBrowser) noexcept;

  CefRefPtr<MyRenderHandler> m_pRenderHandler;
  CefRefPtr<MyLoadHandler> m_pLoadHandler;
  CefRefPtr<CefBrowser> m_pBrowser;
  CefRefPtr<CefContextMenuHandler> m_pContextMenuHandler;

  std::wstring m_cursorPathPNG;
  std::wstring m_cursorPathDDS;

  const std::shared_ptr<ProcessMessageListener> onProcessMessage;
  static std::atomic_bool s_secureOriginAudioCaptureEnabled;
};
}
