// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar CORS para produção
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://seu-dominio.vercel.app'] // Substitua pelo seu domínio
        : '*'
}));
app.use(express.json());

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Conectar ao Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Função para calcular status
async function calculateStationStatus(stationId) {
    try {
        const { data: reports, error } = await supabase
            .from('reports')
            .select('status')
            .eq('station_id', stationId)
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (error || !reports || reports.length === 0) {
            return 'available';
        }
        
        const statusCount = {
            available: 0,
            busy: 0,
            unavailable: 0
        };
        
        reports.forEach(report => {
            if (report.status === 'available') statusCount.available++;
            else if (report.status === 'busy') statusCount.busy++;
            else if (report.status === 'unavailable') statusCount.unavailable++;
        });
        
        if (statusCount.available >= statusCount.busy && statusCount.available >= statusCount.unavailable) {
            return 'available';
        } else if (statusCount.busy >= statusCount.available && statusCount.busy >= statusCount.unavailable) {
            return 'busy';
        } else {
            return 'unavailable';
        }
    } catch (error) {
        console.error('Error in calculateStationStatus:', error);
        return 'available';
    }
}

// Rotas da API
app.get('/api/stations', async (req, res) => {
    try {
        const { data: stations, error: stationsError } = await supabase
            .from('fuel_stations')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (stationsError) throw stationsError;
        
        if (!stations || stations.length === 0) {
            return res.json([]);
        }
        
        const stationsWithStatus = await Promise.all(stations.map(async (station) => {
            const { data: reports, error: reportsError } = await supabase
                .from('reports')
                .select('*')
                .eq('station_id', station.id)
                .order('created_at', { ascending: false });
            
            if (reportsError) throw reportsError;
            
            const status = await calculateStationStatus(station.id);
            const confirmations = reports?.filter(r => r.status === 'available').length || 0;
            const lastUpdate = reports && reports.length > 0 ? reports[0].created_at : station.created_at;
            
            return {
                id: station.id,
                name: station.name,
                location: station.location,
                status: status,
                reportsCount: reports?.length || 0,
                confirmations: confirmations,
                lastUpdate: lastUpdate
            };
        }));
        
        res.json(stationsWithStatus);
    } catch (error) {
        console.error('Error fetching stations:', error);
        res.status(500).json({ error: 'Erro ao buscar postos' });
    }
});

app.post('/api/stations', async (req, res) => {
    const { name, location, status = 'available' } = req.body;
    
    try {
        const { data: newStation, error: insertError } = await supabase
            .from('fuel_stations')
            .insert([{ name, location }])
            .select()
            .single();
        
        if (insertError) throw insertError;
        
        const { error: reportError } = await supabase
            .from('reports')
            .insert([{
                station_id: newStation.id,
                status: status
            }]);
        
        if (reportError) throw reportError;
        
        res.status(201).json({
            ...newStation,
            status: status,
            reportsCount: 1,
            confirmations: status === 'available' ? 1 : 0,
            lastUpdate: new Date()
        });
    } catch (error) {
        console.error('Error adding station:', error);
        res.status(500).json({ error: 'Erro ao adicionar posto' });
    }
});

app.post('/api/stations/:id/report', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    try {
        const { error: reportError } = await supabase
            .from('reports')
            .insert([{
                station_id: parseInt(id),
                status: status
            }]);
        
        if (reportError) throw reportError;
        
        const newStatus = await calculateStationStatus(parseInt(id));
        
        const { data: reports } = await supabase
            .from('reports')
            .select('status')
            .eq('station_id', parseInt(id));
        
        const confirmations = reports?.filter(r => r.status === 'available').length || 0;
        
        res.json({
            success: true,
            status: newStatus,
            confirmations: confirmations,
            totalReports: reports?.length || 0
        });
    } catch (error) {
        console.error('Error reporting status:', error);
        res.status(500).json({ error: 'Erro ao registrar reporte' });
    }
});

// Rota para frontend (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📊 Conectado ao Supabase`);
});