#define NULL ((void*)0)
#define FALSE 0
#define TRUE 1
#define INFINITE 0xFFFFFFFF
#define SW_SHOWNORMAL 1
#define INVALID_FILE_ATTRIBUTES ((unsigned int)-1)

typedef unsigned int DWORD;
typedef int BOOL;
typedef void* HANDLE;
typedef const unsigned short* LPCWSTR;
typedef unsigned short* LPWSTR;
typedef void* HWND;
typedef void* HINSTANCE;
typedef int INT;

typedef struct _STARTUPINFOW {
    DWORD   cb;
    LPWSTR  lpReserved;
    LPWSTR  lpDesktop;
    LPWSTR  lpTitle;
    DWORD   dwX;
    DWORD   dwY;
    DWORD   dwXSize;
    DWORD   dwYSize;
    DWORD   dwXCountChars;
    DWORD   dwYCountChars;
    DWORD   dwFillAttribute;
    DWORD   dwFlags;
    unsigned short wShowWindow;
    unsigned short cbReserved2;
    unsigned char* lpReserved2;
    HANDLE  hStdInput;
    HANDLE  hStdOutput;
    HANDLE  hStdError;
} STARTUPINFOW, *LPSTARTUPINFOW;

typedef struct _PROCESS_INFORMATION {
    HANDLE hProcess;
    HANDLE hThread;
    DWORD  dwProcessId;
    DWORD  dwThreadId;
} PROCESS_INFORMATION, *LPPROCESS_INFORMATION;

__declspec(dllimport) void __stdcall ExitProcess(unsigned int uExitCode);
__declspec(dllimport) HANDLE __stdcall GetStdHandle(DWORD nStdHandle);
__declspec(dllimport) BOOL __stdcall WriteConsoleW(HANDLE hConsoleOutput, const void* lpBuffer, DWORD nNumberOfCharsToWrite, DWORD* lpNumberOfCharsWritten, void* lpReserved);
__declspec(dllimport) DWORD __stdcall GetModuleFileNameW(HANDLE hModule, LPWSTR lpFilename, DWORD nSize);
__declspec(dllimport) DWORD __stdcall GetFileAttributesW(LPCWSTR lpFileName);
__declspec(dllimport) BOOL __stdcall SetCurrentDirectoryW(LPCWSTR lpPathName);
__declspec(dllimport) BOOL __stdcall CreateProcessW(
    LPCWSTR lpApplicationName,
    LPWSTR lpCommandLine,
    void* lpProcessAttributes,
    void* lpThreadAttributes,
    BOOL bInheritHandles,
    DWORD dwCreationFlags,
    void* lpEnvironment,
    LPCWSTR lpCurrentDirectory,
    LPSTARTUPINFOW lpStartupInfo,
    LPPROCESS_INFORMATION lpProcessInformation
);
__declspec(dllimport) DWORD __stdcall WaitForSingleObject(HANDLE hHandle, DWORD dwMilliseconds);
__declspec(dllimport) BOOL __stdcall CloseHandle(HANDLE hObject);
__declspec(dllimport) void __stdcall Sleep(DWORD dwMilliseconds);
__declspec(dllimport) HINSTANCE __stdcall ShellExecuteW(
    HWND hwnd,
    LPCWSTR lpOperation,
    LPCWSTR lpFile,
    LPCWSTR lpParameters,
    LPCWSTR lpDirectory,
    INT nShowCmd
);

static void print(LPCWSTR s) {
    HANDLE hOut = GetStdHandle((DWORD)-11);
    if (!hOut || !s) return;
    DWORD len = 0;
    while (s[len]) len++;
    DWORD written = 0;
    WriteConsoleW(hOut, s, len, &written, NULL);
}

void mainCRTStartup(void) {
    print(L"======================================================================\r\n");
    print(L"   SENTINEL LENS v2.0 - AUTONOMOUS MULTIMODAL HAZARD ADVISOR\r\n");
    print(L"   9-Agent LangGraph Safety Pipeline & Terminal Ember Interface\r\n");
    print(L"======================================================================\r\n\r\n");

    // 1. Locate current directory from executable path
    unsigned short exePath[1024];
    DWORD len = GetModuleFileNameW(NULL, exePath, 1024);
    if (len > 0 && len < 1024) {
        // Strip executable name to leave directory
        for (int i = (int)len - 1; i >= 0; i--) {
            if (exePath[i] == L'\\' || exePath[i] == L'/') {
                exePath[i] = 0;
                break;
            }
        }
        SetCurrentDirectoryW(exePath);
    }

    // 2. Select Python executable
    unsigned short cmdLine[512];
    LPCWSTR pyChoice = NULL;

    if (GetFileAttributesW(L".venv\\Scripts\\python.exe") != INVALID_FILE_ATTRIBUTES) {
        pyChoice = L".venv\\Scripts\\python.exe";
        print(L"[INFO] Found local virtual environment (.venv)\r\n");
    } else if (GetFileAttributesW(L"venv\\Scripts\\python.exe") != INVALID_FILE_ATTRIBUTES) {
        pyChoice = L"venv\\Scripts\\python.exe";
        print(L"[INFO] Found local virtual environment (venv)\r\n");
    } else {
        pyChoice = L"python.exe";
        print(L"[INFO] Searching system PATH for python.exe\r\n");
    }

    // Construct command line: "<pyChoice> -m uvicorn app.api:app --host 0.0.0.0 --port 8000"
    int idx = 0;
    while (*pyChoice) {
        cmdLine[idx++] = *pyChoice++;
    }
    LPCWSTR args = L" -m uvicorn app.api:app --host 0.0.0.0 --port 8000";
    while (*args) {
        cmdLine[idx++] = *args++;
    }
    cmdLine[idx] = 0;

    print(L"[INFO] Launching Sentinel Lens server on port 8000...\r\n");

    STARTUPINFOW si;
    for (unsigned int i = 0; i < sizeof(si); i++) ((char*)&si)[i] = 0;
    si.cb = sizeof(si);

    PROCESS_INFORMATION pi;
    for (unsigned int i = 0; i < sizeof(pi); i++) ((char*)&pi)[i] = 0;

    BOOL ok = CreateProcessW(NULL, cmdLine, NULL, NULL, TRUE, 0, NULL, NULL, &si, &pi);
    if (!ok) {
        print(L"\r\n[ERROR] Failed to start Python process!\r\n");
        print(L"[TIP] Ensure Python 3.10+ is installed and on your system PATH.\r\n");
        print(L"[TIP] Alternatively, run SentinelLens.bat directly.\r\n\r\n");
        print(L"Closing in 10 seconds...\r\n");
        Sleep(10000);
        ExitProcess(1);
    }

    print(L"[INFO] Sentinel Lens server running.\r\n");
    print(L"[INFO] Opening web interface at http://localhost:8000 ...\r\n");
    print(L"[INFO] Press Ctrl+C in this window to stop the advisor.\r\n\r\n");

    // Wait 1.5 seconds for server initialization, then trigger default browser
    Sleep(1500);
    ShellExecuteW(NULL, L"open", L"http://localhost:8000", NULL, NULL, SW_SHOWNORMAL);

    // Wait until user terminates the server
    WaitForSingleObject(pi.hProcess, INFINITE);

    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    ExitProcess(0);
}
