// src/index.js
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import sql from 'mssql';
import cors from 'cors';

// Thiết lập __dirname cho ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Đường dẫn tới file keys.json (đặt ở thư mục gốc dự án)
const KEYS_FILE_PATH = path.join(__dirname, '..', 'keys.json');

// Middleware
app.use(cors());
app.use(express.json());  // parse JSON body
app.use(express.urlencoded({ extended: true })); // parse URL-encoded
app.use(express.static(path.join(__dirname, '../public'))); // serve static files

// CORS configuration
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

/**
 * Hàm đọc và kiểm tra key từ file keys.json
 * @param {string} inputKey - key nhập từ client
 * @returns {Promise<boolean>}
 */
async function validateKey(inputKey) {
    if (!inputKey || typeof inputKey !== 'string') return false;

    try {
        const data = await fs.readFile(KEYS_FILE_PATH, 'utf-8');
        const keyConfig = JSON.parse(data);
        const validKeys = Array.isArray(keyConfig.validKeys) 
            ? keyConfig.validKeys.map(k => String(k).trim()) 
            : [];
        return validKeys.includes(inputKey.trim());
    } catch (error) {
        console.error("⚠️ Lỗi đọc hoặc phân tích keys.json:", error.message);
        return false;
    }
}

// ========== API xác thực Key ==========
app.post('/api/validate-key', async (req, res) => {
    const { key } = req.body;
    console.log(`[API CHECK] Key nhận được: ${key}`);

    try {
        const isValid = await validateKey(key);
        if (isValid) {
            return res.json({ success: true, message: '✅ Xác nhận thành công!' });
        } else {
            return res.status(401).json({ success: false, message: '❌ Key không hợp lệ' });
        }
    } catch (err) {
        console.error("⚠️ Lỗi kiểm tra key:", err.message);
        return res.status(500).json({ success: false, message: 'Lỗi server khi kiểm tra key' });
    }
});

// ========== API kiểm tra kết nối SQL Server ==========
app.post('/api/test-connection', async (req, res) => {
    const { serverName, databaseName, username, password, useWindowAuth } = req.body;

    if (!serverName || !databaseName) {
        return res.status(400).json({
            success: false,
            message: 'Server Name và Database Name không được để trống'
        });
    }

    let pool;

    try {
        console.log('[SQL TEST] Đang kiểm tra kết nối...', { serverName, databaseName });

        const config = {
            server: serverName,
            database: databaseName,
            options: {
                encrypt: false,
                trustServerCertificate: true,
                connectTimeout: 10000,
                requestTimeout: 10000,
                enableKeepAlive: true,
                useUTC: true
            }
        };

        if (!useWindowAuth && username && password) {
            config.authentication = {
                type: 'default',
                options: {
                    userName: username,
                    password: password
                }
            };
        } else if (useWindowAuth) {
            config.authentication = {
                type: 'default'
            };
        }

        pool = new sql.ConnectionPool(config);
        await pool.connect();
        console.log('✅ Kết nối đến server thành công!');
        
        await pool.request().query('SELECT 1 as connection_test');
        
        const serverInfoResult = await pool.request().query(
            `SELECT @@VERSION as ServerVersion, @@SERVERNAME as ServerName, 
             DB_NAME() as DatabaseName`
        );

        res.json({
            success: true,
            message: 'Kết nối thành công!',
            data: {
                server: serverName,
                database: databaseName,
                serverVersion: serverInfoResult.recordset[0]?.ServerVersion || 'Unknown',
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Lỗi kết nối SQL:', error.message);
        
        let errorMessage = 'Không thể kết nối đến SQL Server';
        let statusCode = 500;

        if (error.message.includes('ENOTFOUND') || error.code === 'ENOTFOUND') {
            errorMessage = '🔍 Không tìm thấy server. Kiểm tra tên server hoặc địa chỉ IP.';
            statusCode = 400;
        } else if (error.message.includes('ESOCKET') || error.code === 'ESOCKET') {
            errorMessage = '🔗 Lỗi kết nối mạng. Kiểm tra cổng SQL Server (mặc định 1433).';
            statusCode = 400;
        } else if (error.message.includes('Login failed') || error.message.includes('authentication')) {
            errorMessage = '🔐 Tên đăng nhập hoặc mật khẩu không đúng.';
            statusCode = 401;
        } else if (error.message.includes('Cannot open database') || error.message.includes('does not exist')) {
            errorMessage = '📦 Cơ sở dữ liệu không tồn tại hoặc không có quyền truy cập.';
            statusCode = 400;
        } else if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
            errorMessage = '⏱️ Kết nối hết thời gian chờ. Server có thể không phản hồi hoặc quá tải.';
            statusCode = 408;
        } else if (error.message.includes('connection refused')) {
            errorMessage = '🚫 Kết nối bị từ chối. SQL Server có thể không đang chạy.';
            statusCode = 400;
        }

        res.status(statusCode).json({
            success: false,
            message: errorMessage,
            error: error.message,
            code: error.code
        });
    } finally {
        if (pool) {
            try {
                await pool.close();
                console.log('[SQL] Pool đã được đóng');
            } catch (err) {
                console.error('[SQL] Lỗi khi đóng pool:', err.message);
            }
        }
    }
});

// ========== API tạo nhân viên (tblNhanVien) ==========
app.post('/api/create-employee', async (req, res) => {
    const { 
        connectionData, 
        tennhanvien, 
        namsinh, 
        gioitinh, 
        cmnd, 
        dienthoai, 
        vitri, 
        congviec, 
        mucluong, 
        diachi, 
        ghichu, 
        idvaitro 
    } = req.body;

    console.log('[CREATE EMPLOYEE] Dữ liệu nhận được:', {
        tennhanvien,
        namsinh,
        gioitinh,
        dienthoai
    });

    // Validate chỉ 4 trường bắt buộc
    if (!connectionData || !tennhanvien || !namsinh || gioitinh === undefined || gioitinh === null || !dienthoai) {
        console.log('[CREATE EMPLOYEE] Validation failed');
        return res.status(400).json({
            success: false,
            message: 'Thiếu dữ liệu bắt buộc (Tên, Năm sinh, Giới tính, Điện thoại)'
        });
    }

    let pool;

    try {
        console.log('[CREATE EMPLOYEE] Đang tạo nhân viên...');

        const config = {
            server: connectionData.serverName,
            database: connectionData.databaseName,
            options: {
                encrypt: false,
                trustServerCertificate: true,
                connectTimeout: 10000,
                requestTimeout: 10000,
                enableKeepAlive: true,
                useUTC: true
            }
        };

        if (!connectionData.useWindowAuth && connectionData.username && connectionData.password) {
            config.authentication = {
                type: 'default',
                options: {
                    userName: connectionData.username,
                    password: connectionData.password
                }
            };
        } else if (connectionData.useWindowAuth) {
            config.authentication = {
                type: 'default'
            };
        }

        pool = new sql.ConnectionPool(config);
        await pool.connect();

        // Sinh random 12 số cho idnhanvien
        const generateRandomId = () => {
            return Math.floor(Math.random() * 1000000000000).toString().padStart(12, '0');
        };

        const idnhanvien = generateRandomId();
        const idvaitroValue = idvaitro ? idvaitro.toString() : '160120160000';

        console.log('[CREATE EMPLOYEE] idnhanvien:', idnhanvien, 'gioitinh:', gioitinh);

        // Thực hiện INSERT vào tblNhanVien
        const request = pool.request();
        request.input('idnhanvien', sql.VarChar(12), idnhanvien);
        request.input('tennhanvien', sql.NVarChar(200), tennhanvien);
        request.input('namsinh', sql.Char(4), namsinh.toString());
        request.input('gioitinh', sql.TinyInt, parseInt(gioitinh)); // 1 = Nam, 0 = Nữ
        request.input('cmnd', sql.Char(15), cmnd || '');
        request.input('diachi', sql.NVarChar(1000), diachi || '');
        request.input('dienthoai', sql.VarChar(500), dienthoai);
        request.input('vitri', sql.NVarChar(400), vitri || '');
        request.input('congviec', sql.NVarChar(2000), congviec || '');
        request.input('mucluong', sql.Decimal(18, 2), mucluong ? parseFloat(mucluong) : 0);
        request.input('ghichu', sql.NVarChar(2000), ghichu || '');
        request.input('idvaitro', sql.VarChar(12), idvaitroValue);

        await request.query(`
            INSERT INTO [tblNhanVien]
            (
                [idnhanvien],
                [tennhanvien],
                [namsinh],
                [gioitinh],
                [cmnd],
                [diachi],
                [dienthoai],
                [vitri],
                [congviec],
                [mucluong],
                [ghichu],
                [idvaitro]
            )
            VALUES
            (
                @idnhanvien,
                @tennhanvien,
                @namsinh,
                @gioitinh,
                @cmnd,
                @diachi,
                @dienthoai,
                @vitri,
                @congviec,
                @mucluong,
                @ghichu,
                @idvaitro
            )
        `);

        console.log('✅ Nhân viên được tạo thành công! idnhanvien:', idnhanvien);

        res.json({
            success: true,
            message: 'Nhân viên được tạo thành công!',
            data: {
                idnhanvien,
                tennhanvien,
                namsinh,
                gioitinh: parseInt(gioitinh),
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Lỗi khi tạo nhân viên:', error.message);

        let errorMessage = 'Lỗi khi tạo nhân viên';

        if (error.message.includes('permission') || error.message.includes('denied')) {
            errorMessage = 'Không có quyền INSERT vào bảng tblNhanVien';
        } else if (error.message.includes('duplicate') || error.message.includes('PRIMARY KEY')) {
            errorMessage = 'ID nhân viên hoặc CMND đã tồn tại';
        } else if (error.message.includes('timeout')) {
            errorMessage = 'Kết nối hết thời gian chờ';
        }

        res.status(500).json({
            success: false,
            message: errorMessage,
            error: error.message
        });

    } finally {
        if (pool) {
            try {
                await pool.close();
                console.log('[CREATE EMPLOYEE] Pool đã được đóng');
            } catch (err) {
                console.error('[CREATE EMPLOYEE] Lỗi khi đóng pool:', err.message);
            }
        }
    }
});

// ========== API tạo tài khoản (tblUser) ==========
app.post('/api/create-account', async (req, res) => {
    const { connectionData, employeeData, account, password } = req.body;

    console.log('[CREATE ACCOUNT] Dữ liệu nhận được:', { account, idnhanvien: employeeData?.idnhanvien });

    if (!connectionData || !employeeData || !account || !password) {
        return res.status(400).json({
            success: false,
            message: 'Dữ liệu không hợp lệ'
        });
    }

    let pool;

    try {
        console.log('[CREATE ACCOUNT] Đang tạo tài khoản...');

        const config = {
            server: connectionData.serverName,
            database: connectionData.databaseName,
            options: {
                encrypt: false,
                trustServerCertificate: true,
                connectTimeout: 10000,
                requestTimeout: 10000,
                enableKeepAlive: true,
                useUTC: true
            }
        };

        if (!connectionData.useWindowAuth && connectionData.username && connectionData.password) {
            config.authentication = {
                type: 'default',
                options: {
                    userName: connectionData.username,
                    password: connectionData.password
                }
            };
        } else if (connectionData.useWindowAuth) {
            config.authentication = {
                type: 'default'
            };
        }

        pool = new sql.ConnectionPool(config);
        await pool.connect();

        // Lấy idnhanvien từ nhân viên vừa tạo làm MaTaiKhoan và MaNguoiDung
        const maTaiKhoan = employeeData.idnhanvien;
        const maNguoiDung = employeeData.idnhanvien;

        console.log('[CREATE ACCOUNT] MaTaiKhoan:', maTaiKhoan, 'MaNguoiDung:', maNguoiDung);

        // Thực hiện INSERT vào tblUser
        const request = pool.request();
        request.input('MaTaiKhoan', sql.VarChar(12), maTaiKhoan);
        request.input('MaNguoiDung', sql.VarChar(12), maNguoiDung);
        request.input('Account', sql.VarChar(50), account);
        request.input('Password', sql.VarChar(50), password);
        request.input('isadmin', sql.Bit, 0);

        await request.query(`
            INSERT INTO [tblUser]
            (
                [MaTaiKhoan],
                [MaNguoiDung],
                [Account],
                [Password],
                [isadmin]
            )
            VALUES
            (
                @MaTaiKhoan,
                @MaNguoiDung,
                @Account,
                @Password,
                @isadmin
            )
        `);

        console.log('✅ Tài khoản được tạo thành công!');

        res.json({
            success: true,
            message: 'Tài khoản được tạo thành công!',
            data: {
                maTaiKhoan,
                maNguoiDung,
                account,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Lỗi khi tạo tài khoản:', error.message);

        let errorMessage = 'Lỗi khi tạo tài khoản';

        if (error.message.includes('permission') || error.message.includes('denied')) {
            errorMessage = 'Không có quyền INSERT vào bảng tblUser';
        } else if (error.message.includes('duplicate') || error.message.includes('PRIMARY KEY')) {
            errorMessage = 'Tài khoản hoặc ID đã tồn tại';
        } else if (error.message.includes('timeout')) {
            errorMessage = 'Kết nối hết thời gian chờ';
        }

        res.status(500).json({
            success: false,
            message: errorMessage,
            error: error.message
        });

    } finally {
        if (pool) {
            try {
                await pool.close();
                console.log('[CREATE ACCOUNT] Pool đã được đóng');
            } catch (err) {
                console.error('[CREATE ACCOUNT] Lỗi khi đóng pool:', err.message);
            }
        }
    }
});

// ========== API Health Check ==========
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Server đang chạy',
        timestamp: new Date().toISOString()
    });
});

// ========== 404 Handler ==========
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint không tìm thấy'
    });
});

// ========== Error Handler ==========
app.use((err, req, res, next) => {
    console.error('[ERROR] Server error:', err);
    res.status(500).json({
        success: false,
        message: 'Lỗi server nội bộ',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ========== Start Server ==========
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy: http://localhost:${PORT}`);
    console.log(`📝 Health check: http://localhost:${PORT}/api/health`);
});