import { pool } from './src/db.js'; 

const ciudadesData = [
    { estado: "Amazonas", ciudades: ["Puerto Ayacucho", "San Fernando de Atabapo", "Maroa"] },
    { estado: "Anzoátegui", ciudades: ["Barcelona", "Puerto La Cruz", "El Tigre", "Anaco"] },
    // ... añade los demás estados de tu lista aquí
];

async function seed() {
    try {
        for (const item of ciudadesData) {
            // Insertar estado y obtener su ID
            const resEstado = await pool.query(
                'INSERT INTO estados (nombre) VALUES ($1) ON CONFLICT (nombre) DO UPDATE SET nombre=EXCLUDED.nombre RETURNING id',
                [item.estado]
            );
            const estadoId = resEstado.rows[0].id;

            // Insertar ciudades correspondientes
            for (const ciudad of item.ciudades) {
                await pool.query(
                    'INSERT INTO ciudades (nombre, estado_id) VALUES ($1, $2)',
                    [ciudad, estadoId]
                );
            }
            console.log(`✅ Importado: ${item.estado}`);
        }
        console.log("🚀 Importación masiva completada.");
    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        pool.end();
    }
}

seed();