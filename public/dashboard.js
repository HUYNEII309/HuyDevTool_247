// public/dashboard.js

/**
 * Tạo và tải xuống file batch SetVietnameseLocale.bat
 */
function downloadVietnameseLocaleBatch() {
    const batch = `@echo off
:: Batch file chay PowerShell script voi quyen Administrator
:: Nhap dup vao file nay de chay

echo ============================================
echo   Cai dat tieng Viet cho Windows
echo ============================================
echo.

:: Yeu cau quyen admin
>nul 2>&1 "%SYSTEMROOT%\\system32\\cacls.exe" "%SYSTEMROOT%\\system32\\config\\system"
if '%errorlevel%' NEQ '0' (
    echo Dang yeu cau quyen Administrator...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\\getadmin.vbs"
    "%temp%\\getadmin.vbs"
    exit /B

:gotAdmin
    if exist "%temp%\\getadmin.vbs" ( del "%temp%\\getadmin.vbs" )
    pushd "%CD%"
    CD /D "%~dp0"

:: Chay lenh PowerShell
echo [1/4] Dang cai dat Culture...
powershell -Command "Set-Culture vi-VN"

echo [2/4] Dang cai dat Language List...
powershell -Command "$l=New-WinUserLanguageList vi-VN; Set-WinUserLanguageList $l -Force"

echo [3/4] Dang cai dat System Locale...
powershell -Command "Set-WinSystemLocale vi-VN"

echo [4/4] Dang cai dat Home Location...
powershell -Command "Set-WinHomeLocation -GeoId 235"

echo.
echo ========================================
echo   Hoan tat! Vui long khoi dong lai may.
echo ========================================
echo.

pause
`;

    const blob = new Blob([batch], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SetVietnameseLocale.bat';
    a.click();
    URL.revokeObjectURL(url);
}
// Export hàm để các nút onclick trong HTML có thể gọi
window.downloadVietnameseLocaleBatch = downloadVietnameseLocaleBatch;


document.addEventListener('DOMContentLoaded', () => {
    // ------------------------------------------------------------------
    // 1. LOGIC BẢO VỆ TRANG (CHỈ CHO PHÉP TRUY CẬP KHI ĐÃ ĐĂNG NHẬP)
    // ------------------------------------------------------------------
    
    const isLoggedIn = localStorage.getItem('loggedIn') === 'true';

    if (!isLoggedIn) {
        console.warn("Truy cập bị chặn. Chuyển hướng về trang đăng nhập.");
        window.location.href = 'index.html'; 
        return; 
    }
    
    // ------------------------------------------------------------------
    // 2. LOGIC TÌM KIẾM/LỌC CARD
    // ------------------------------------------------------------------
    const searchBar = document.querySelector('.search-bar');
    const functionCards = document.querySelectorAll('.function-card');

    function filterCards() {
        const searchTerm = searchBar.value.toLowerCase().trim();

        functionCards.forEach(card => {
            const title = card.querySelector('h3').textContent.toLowerCase();
            const description = card.querySelector('.card-description').textContent.toLowerCase();

            if (title.includes(searchTerm) || description.includes(searchTerm)) {
                card.style.display = 'grid'; 
            } else {
                card.style.display = 'none'; 
            }
        });
    }

    if (searchBar) {
        searchBar.addEventListener('keyup', filterCards);
    }
    
    // ------------------------------------------------------------------
    // 3. LOGIC ĐĂNG XUẤT
    // ------------------------------------------------------------------
    const logoutBtn = document.querySelector('.btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            try {
                localStorage.removeItem('loggedIn');
            } catch (error) {
                console.warn("Không thể truy cập localStorage để đăng xuất.");
            }
            
            window.location.href = 'index.html'; 
        });
    }
    
    // ------------------------------------------------------------------
    // 4. LOGIC HIỂN THỊ MODAL HƯỚNG DẪN NGÀY GIỜ & TẢI XUỐNG
    // ------------------------------------------------------------------
    
    // Nút Tải xuống trên Card chính (Thẻ 1)
    const downloadCardBtn = document.querySelector('.function-card:first-child .btn-download'); 
    
    // Modal Ngày Giờ
    const guideBtn = document.querySelector('.function-card:first-child .link-guide');
    const modal = document.getElementById('guideModal'); 
    const closeModalBtn = document.querySelector('#guideModal .close-modal');
    const downloadModalBtn = document.querySelector('#guideModal .btn-action-main'); 

    // Hàm đóng Modal Ngày Giờ
    const closeModal = () => {
        if (modal) {
            modal.classList.remove('open');
        }
    };
    window.closeModal = closeModal; 
    
    // Logic Tải xuống TRỰC TIẾP từ Card
    if (downloadCardBtn) {
        downloadCardBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("-> Bấm nút Tải xuống trên Card Ngày Giờ.");
            downloadVietnameseLocaleBatch();
        });
    }

    // Logic Modal Ngày Giờ: Mở, Đóng, và Tải xuống từ Modal
    if (guideBtn && modal) {
        guideBtn.addEventListener('click', (e) => {
            e.preventDefault();
            modal.classList.add('open');
            console.log("-> Mở Modal Hướng dẫn Ngày Giờ.");
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModal);
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    // Tải xuống từ nút trong Modal Ngày Giờ
    if (downloadModalBtn) {
        downloadModalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("-> Bấm nút Tải xuống ngay trong Modal Ngày Giờ.");
            closeModal(); 
            downloadVietnameseLocaleBatch(); 
        });
    }
    
    // 5. LOGIC THẺ TẠO LẠI ADMIN (Mở Hướng dẫn & Modal SQL)
    // ------------------------------------------------------------------
    
   // Cách tốt nhất - không phụ thuộc thứ tự
    const adminCard = document.querySelector('.function-card:nth-child(2)');
    
    // Nút "Hướng dẫn" & Nút "Tạo ngay" trong thẻ đó
    const adminGuideBtn = adminCard ? adminCard.querySelector('.link-guide') : null;
    const createAdminBtn = adminCard ? adminCard.querySelector('.btn-download') : null; // Nút Tạo ngay
    
    // Modal Hướng dẫn Admin
    const adminModal = document.getElementById('adminGuideModal');
    const closeAdminModalBtn = document.querySelector('.close-admin-modal');

    // Modal Form SQL
    const sqlConnectModal = document.getElementById('sqlConnectModal');
    const closeSqlModalBtns = document.querySelectorAll('.close-sql-modal');

    // Hàm đóng Modal Admin
    const closeAdminModal = () => {
        if (adminModal) {
            adminModal.classList.remove('open');
        }
    };
    window.closeAdminGuideModal = closeAdminModal; 

    // Hàm đóng Modal SQL
    const closeSqlModal = () => {
        if (sqlConnectModal) {
            sqlConnectModal.classList.remove('open');
        }
    };
    window.closeSqlModal = closeSqlModal; 

    // 5a. Logic Mở Modal Hướng dẫn Admin
    if (adminGuideBtn && adminModal) {
        adminGuideBtn.addEventListener('click', (e) => {
            e.preventDefault();
            adminModal.classList.add('open');
            console.log("-> Mở Modal Hướng dẫn Tạo lại Admin.");
        });
    }

    // Đóng Modal Hướng dẫn Admin
    if (closeAdminModalBtn) {
        closeAdminModalBtn.addEventListener('click', closeAdminModal);
    }

    // Đóng Modal Hướng dẫn khi click ra ngoài
    if (adminModal) {
        adminModal.addEventListener('click', (e) => {
            if (e.target === adminModal) {
                closeAdminModal();
            }
        });
    }
    
    // 5b. Logic Mở Modal Form SQL khi nhấn "Tạo ngay"
    if (createAdminBtn && sqlConnectModal) {
        createAdminBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sqlConnectModal.classList.add('open');
            console.log("-> Mở Modal Form Kết nối SQL Server.");
        });
    }

    // 5c. Logic Đóng Modal SQL (Nút Hủy/Đóng)
    if (closeSqlModalBtns.length > 0) {
        closeSqlModalBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                closeSqlModal();
            });
        });
    }
    
    // 5d. Xử lý sự kiện Submit Form SQL (chưa có chức năng backend)
    const sqlConnectForm = document.getElementById('sqlConnectForm');
    if (sqlConnectForm) {
        sqlConnectForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const serverName = document.getElementById('serverName').value;
            const databaseName = document.getElementById('databaseName').value;
            const username = document.getElementById('username').value;
            // Password không nên được log ra console trong thực tế
            
            console.log("-> Bắt đầu kết nối SQL với:", { serverName, databaseName, username });
            
            // Ở đây sẽ là logic gọi API/Backend để xử lý kết nối và tạo Admin
            // Ví dụ: showToast('Đang kết nối và tạo Admin...', 'info');
            
            closeSqlModal();
        });
    }
    
}); // End DOMContentLoadedaded