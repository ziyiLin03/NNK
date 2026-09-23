// frontend/src/pages/Dashboard\.js
import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import reportService from '../services/reportService.js';

const TIPO_PUNTO_OPTIONS = ['', 'actual', 'pushback', 'policia', 'mafia'];

const Dashboard = () => {
    const { logout, user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [reports, setReports] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const [error, setError] = useState(null);

    // ─── Filtros ────────────────────────────────────────────
    const [tipoPunto, setTipoPunto] = useState('');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');

    const fetchReports = async () => {
        setLoadingData(true);
        setError(null);
        try {
            // Solo mandamos los filtros que tienen valor
            const filters = {};
            if (tipoPunto)   filters.tipo_punto  = tipoPunto;
            if (fechaDesde)  filters.fecha_desde = fechaDesde;
            if (fechaHasta)  filters.fecha_hasta = fechaHasta;

            const data = await reportService.getAllReports(filters);
            setReports(data);
        } catch (err) {
            setError("No se pudieron cargar los reportes.");
        } finally {
            setLoadingData(false);
        }
    };

    useEffect(() => {
        if (user?.role !== 'volunteer') {
            fetchReports();
        } else {
            setLoadingData(false);
        }
    }, [user]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleCrearReportePrueba = async () => {
        const reporteFalso = {
            latitude: 41.3851,
            longitude: 2.1734,
            people_count: Math.floor(Math.random() * 20) + 1,
            needs: "Agua, Ropa de abrigo, Asistencia médica",
            notes: "Generado automáticamente desde React"
        };
        try {
            await reportService.createReport(reporteFalso);
            fetchReports();
        } catch (err) {
            alert("Error al crear el reporte. Mira la consola.");
        }
    };

    const handleLimpiarFiltros = () => {
        setTipoPunto('');
        setFechaDesde('');
        setFechaHasta('');
        // useEffect no se re-ejecuta solo, llamamos fetchReports manualmente
        setTimeout(() => fetchReports(), 0);
    };

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>Dashboard Analítico 📊</h1>
                <button onClick={handleLogout} style={{ padding: '10px', background: '#ff4d4d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                    Cerrar Sesión
                </button>
            </div>

            <p>Hola, <strong>{user?.username}</strong> (Rol: {user?.role})</p>
            <hr />

            {/* ─── Filtros ─────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginTop: '16px', flexWrap: 'wrap' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>Tipo de punto</label>
                    <select value={tipoPunto} onChange={e => setTipoPunto(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}>
                        <option value="">Todos</option>
                        <option value="actual">Actual</option>
                        <option value="pushback">Pushback</option>
                        <option value="policia">Policía</option>
                        <option value="mafia">Mafia</option>
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>Fecha desde</label>
                    <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }} />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>Fecha hasta</label>
                    <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }} />
                </div>
                <button onClick={fetchReports} style={{ padding: '8px 16px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                    🔍 Filtrar
                </button>
                <button onClick={handleLimpiarFiltros} style={{ padding: '8px 16px', background: '#888', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                    ✕ Limpiar
                </button>
            </div>

            {/* ─── Tabla ───────────────────────────────────────────── */}
            <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>Reportes de Campo</h2>
                    <button onClick={handleCrearReportePrueba} style={{ padding: '8px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                        + Crear Reporte de Prueba
                    </button>
                </div>

                {loadingData && <p>Cargando datos...</p>}
                {error && <p style={{ color: 'red' }}>{error}</p>}

                {!loadingData && !error && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                        <thead>
                            <tr style={{ background: '#333', color: 'white', textAlign: 'left' }}>
                                <th style={{ padding: '10px' }}>ID</th>
                                <th style={{ padding: '10px' }}>Fecha registro</th>
                                <th style={{ padding: '10px' }}>Hora evento</th>
                                <th style={{ padding: '10px' }}>Timezone</th>
                                <th style={{ padding: '10px' }}>Tipo</th>
                                <th style={{ padding: '10px' }}>Personas</th>
                                <th style={{ padding: '10px' }}>Necesidades</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reports.length === 0 ? (
                                <tr><td colSpan="7" style={{ padding: '10px', textAlign: 'center' }}>No hay reportes.</td></tr>
                            ) : (
                                reports.map((report) => (
                                    <tr key={report.id} style={{ borderBottom: '1px solid #ccc' }}>
                                        <td style={{ padding: '10px' }}>#{report.id}</td>
                                        <td style={{ padding: '10px' }}>{new Date(report.timestamp).toLocaleString()}</td>
                                        <td style={{ padding: '10px' }}>{report.hora_evento ? new Date(report.hora_evento).toLocaleString() : '—'}</td>
                                        <td style={{ padding: '10px' }}>{report.timezone || '—'}</td>
                                        <td style={{ padding: '10px' }}>{report.tipo_punto || '—'}</td>
                                        <td style={{ padding: '10px' }}><strong>{report.people_count ?? '—'}</strong></td>
                                        <td style={{ padding: '10px' }}>{report.needs || '—'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default Dashboard;
