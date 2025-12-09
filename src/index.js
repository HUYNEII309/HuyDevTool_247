// src/index.js
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import sql from 'mssql';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const KEYS_FILE_PATH = path.join(__dirname, '..', 'keys.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// === VALIDATE KEY ===
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
        console.error("Lỗi đọc keys.json:", error.message);
        return false;
    }
}


// ==================== API HIỂN THỊ MẬT KHẨU (ĐÃ FIX TLS + VỊ TRÍ CHUẨN 100%) ====================
// ==================== API HIỂN THỊ MẬT KHẨU – HOÀN HẢO NHƯ TEST-CONNECTION ====================
app.post('/api/show-passwords', async (req, res) => {
    const { serverName, databaseName, username, password, useWindowAuth = false } = req.body;

    if (!serverName || !databaseName) {
        return res.status(400).json({ success: false, message: 'Thiếu Server Name hoặc Database Name' });
    }

    let pool = null;

    try {
        const config = {
            server: serverName,
            database: databaseName,
            options: {
                encrypt: false,                    // giống test-connection của bạn
                trustServerCertificate: true,        // tương đương trustServerCertificate
                connectTimeout: 15000,
                requestTimeout: 30000
            }
        };

        // Nếu không dùng Windows Auth → dùng SQL Login
        if (!useWindowAuth && username && password) {
            config.authentication = {
                type: 'default',
                options: {
                    userName: username,
                    password: password
                }
            };
        }
        // Nếu dùng Windows Auth → để trống user/pass là được

        pool = new sql.ConnectionPool(config);
        await pool.connect();

        const result = await pool.request().query(`
            SELECT 
                u.Account AS Account,
                u.Password AS Password,
                nv.tennhanvien AS tennhanvien
            FROM dbo.tblUser u
            INNER JOIN dbo.tblNhanVien nv ON u.MaNguoiDung = nv.idnhanvien
            ORDER BY nv.tennhanvien
        `);

        res.json({
            success: true,
            results: result.recordset
        });

    } catch (error) {
        console.error('Lỗi kết nối/truy vấn mật khẩu:', error.message);
        res.status(500).json({
            success: false,
            message: error.message || 'Không thể kết nối hoặc lấy dữ liệu'
        });
    } finally {
        if (pool) {
            await pool.close().catch(() => {});
        }
    }
});

app.post('/api/validate-key', async (req, res) => {
    const { key } = req.body;
    const isValid = await validateKey(key);
    return isValid
        ? res.json({ success: true, message: 'Xác nhận thành công!' })
        : res.status(401).json({ success: false, message: 'Key không hợp lệ' });
});

// === TEST CONNECTION ===
app.post('/api/test-connection', async (req, res) => {
    const { serverName, databaseName, username, password, useWindowAuth } = req.body;
    if (!serverName || !databaseName) return res.status(400).json({ success: false, message: 'Thiếu thông tin kết nối' });

    let pool;
    try {
        const config = {
            server: serverName,
            database: databaseName,
            options: { encrypt: false, trustServerCertificate: true, connectTimeout: 15000, requestTimeout: 30000 }
        };
        if (!useWindowAuth && username && password) {
            config.authentication = { type: 'default', options: { userName: username, password: password } };
        }
        pool = new sql.ConnectionPool(config);
        await pool.connect();
        await pool.request().query('SELECT 1');
        res.json({ success: true, message: 'Kết nối thành công!' });
    } catch (error) {
        console.error('Lỗi kết nối SQL:', error.message);
        res.status(500).json({ success: false, message: error.message || 'Không thể kết nối SQL Server' });
    } finally {
        if (pool) await pool.close().catch(() => {});
    }
});

// === IMPORT BỆNH NHÂN – HOÀN HẢO 100% (ID + SOHOSO + NGÀY DD/MM/YYYY CHÍNH XÁC) ===
app.post('/api/import-patients', async (req, res) => {
    const { connection, patients } = req.body;

    if (!connection || !patients || !Array.isArray(patients) || patients.length === 0) {
        return res.status(400).json({ success: false, message: 'Không có dữ liệu để import' });
    }

    let pool = null;
    const errors = [];
    let successCount = 0;

    try {
        const config = {
            server: connection.server,
            database: connection.db,
            options: { encrypt: false, trustServerCertificate: true, connectTimeout: 15000, requestTimeout: 90000 }
        };
        if (!connection.winAuth && connection.user && connection.pass) {
            config.authentication = { type: 'default', options: { userName: connection.user, password: connection.pass } };
        }

        pool = new sql.ConnectionPool(config);
        await pool.connect();
        console.log('[IMPORT] Kết nối SQL thành công');

        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yy = String(today.getFullYear()).slice(-2);
        const prefix = `${dd}${mm}${yy}`;

        // Lấy số thứ tự ID hôm nay
        let nextIdSeq = 1;
        try {
            const r = await pool.request().query(`
                SELECT ISNULL(MAX(CAST(SUBSTRING(idbenhnhan,7,6) AS INT)),0)+1 AS seq
                FROM tblBenhnhan WHERE idbenhnhan LIKE '${prefix}%'
            `);
            nextIdSeq = r.recordset[0].seq;
        } catch (e) { console.log('Bắt đầu ID từ 000001'); }

        // Lấy số hồ sơ lớn nhất
        let nextSoHoSo = 1;
        try {
            const r = await pool.request().query(`SELECT ISNULL(MAX(sohoso),0)+1 AS next FROM tblBenhnhan`);
            nextSoHoSo = r.recordset[0].next;
        } catch (e) { console.log('Bắt đầu sohoso từ 1'); }

        for (let i = 0; i < patients.length; i++) {
            const p = patients[i];
            const rowNum = i + 2;

            try {
                // 1. ID BỆNH NHÂN
                let idbenhnhan = String(p.idbenhnhan || '').trim();
                if (!idbenhnhan || idbenhnhan === '#' || !/^\d{12}$/.test(idbenhnhan)) {
                    idbenhnhan = prefix + String(nextIdSeq++).padStart(6, '0');
                }

                // 2. GIỚI TÍNH
                let gioitinh = 0;
                if (String(p.gioitinh || '').trim().toLowerCase().includes('nam')) gioitinh = 1;

                // 3. NĂM SINH
                let namsinh = String(p.namsinh || '').trim();
                if (namsinh.includes('#') || !namsinh) namsinh = today.getFullYear().toString();
                else namsinh = namsinh.substring(0, 4);

                // 4. NGÀY ĐẾN – ĐÃ FIX HOÀN TOÀN DD/MM/YYYY
                let ngayden = null;
                const ndRaw = String(p.ngayden || '').trim();

                if (ndRaw.includes('#') || !ndRaw) {
                    ngayden = today.toISOString().split('T')[0];
                } else {
                    let parsed = null;

                    // Hỗ trợ DD/MM/YYYY hoặc D/M/YYYY
                    if (ndRaw.includes('/')) {
                        const parts = ndRaw.split('/');
                        if (parts.length === 3) {
                            const d = parts[0].padStart(2, '0');
                            const m = parts[1].padStart(2, '0');
                            const y = parts[2];
                            if (y.length === 4 && !isNaN(d) && !isNaN(m) && !isNaN(y)) {
                                parsed = `${y}-${m}-${d}`;
                            }
                        }
                    }
                    // Hỗ trợ YYYY-MM-DD
                    else if (/^\d{4}-\d{2}-\d{2}$/.test(ndRaw)) {
                        parsed = ndRaw;
                    }

                    if (parsed && !isNaN(new Date(parsed).getTime())) {
                        ngayden = parsed;
                    } else {
                        ngayden = today.toISOString().split('T')[0]; // fallback
                    }
                }

                // 5. SỐ HỒ SƠ
                const sohoso = nextSoHoSo++;

                // INSERT
                const request = pool.request();
                request.input('idbenhnhan', sql.VarChar(12), idbenhnhan);
                request.input('tenbenhnhan', sql.NVarChar(100), String(p.tenbenhnhan || 'Không tên').trim());
                request.input('gioitinh', sql.TinyInt, gioitinh);
                request.input('namsinh', sql.Char(4), namsinh);
                request.input('dienthoai', sql.NVarChar(50), p.dienthoai ? String(p.dienthoai).trim() : null);
                request.input('diachi', sql.NVarChar(200), p.diachi ? String(p.diachi).trim() : null);
                request.input('ngayden', sql.Date, ngayden);
                request.input('sohoso', sql.Int, sohoso);

                await request.query(`
                    INSERT INTO tblBenhnhan 
                    (idbenhnhan, tenbenhnhan, gioitinh, namsinh, dienthoai, diachi, ngayden, sohoso)
                    VALUES (@idbenhnhan, @tenbenhnhan, @gioitinh, @namsinh, @dienthoai, @diachi, @ngayden, @sohoso)
                `);

                successCount++;
            } catch (err) {
                errors.push(`Dòng ${rowNum}: ${err.message.split('\n')[0]}`);
            }
        }

        res.json({
            success: true,
            message: 'Import thành công!',
            data: {
                total: patients.length,
                success: successCount,
                failed: errors.length,
                errors: errors.length > 0 ? errors : null
            }
        });

    } catch (err) {
        console.error('[IMPORT] Lỗi nghiêm trọng:', err.message);
        res.status(500).json({ success: false, message: 'Lỗi server', error: err.message });
    } finally {
        if (pool) await pool.close().catch(() => {});
    }
});


// === HEALTH & ERROR ===
app.get('/api/health', (req, res) => res.json({ status: 'OK', message: 'Server chạy tốt!', time: new Date().toLocaleString('vi-VN') }));
app.use((req, res) => res.status(404).json({ success: false, message: 'Endpoint không tồn tại' }));
app.use((err, req, res, next) => {
    console.error('[SERVER ERROR]:', err);
    res.status(500).json({ success: false, message: 'Lỗi server nội bộ' });
});


// ========== KHỞI ĐỘNG SERVER ==========
app.listen(PORT, () => {
    console.log(`Server đang chạy tại: http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`API Import: POST http://localhost:${PORT}/api/import-patients`);
    console.log(`API hiển thị mật khẩu: POST http://localhost:${PORT}/api/show-passwords`);
});