// Script independiente para enviar solicitudes a la API de comedor
const axios = require('axios');
const FormData = require('form-data');

// Configuración
const API_URL = 'https://comensales.uncp.edu.pe/api/registros';
const userData = {
  dni: '75908353',
  code: '2021101385B',
};
const numRequests = 1; // Número de solicitudes a enviar
const interval = 50; // Intervsalo entre solicitudes en ms

// Función para enviar una solicitud
async function sendRequest(attempt) {
  try {
    console.log(`🚀 Enviando solicitud ${attempt + 1}/${numRequests}...`);

    const payload = {
      t1_id: null,
      t1_dni: userData.dni,
      t1_codigo: userData.code,
      t1_nombres: '',
      t1_escuela: '',
      t1_estado: null,
      t3_periodos_t3_id: null,
    };

    console.log(`📦 Payload: ${JSON.stringify(payload)}`);

    // Crear FormData y añadir el JSON como campo "data"
    const form = new FormData();
    form.append('data', JSON.stringify(payload));

    const startTime = Date.now();
    const response = await axios.post(API_URL, form, {
      headers: {
        ...form.getHeaders(),
        Referer: 'https://comensales.uncp.edu.pe/', // Importante: añadir el referer
      },
    });
    const endTime = Date.now();

    console.log(`✅ Respuesta recibida (${endTime - startTime}ms)`);
    console.log(`📋 Código de estado: ${response.status}`);
    console.log(`📝 Datos: ${JSON.stringify(response.data)}`);

    // Si el registro fue exitoso
    if (response.data.code === 201) {
      console.log(
        `🎉 ¡REGISTRO EXITOSO! Ticket obtenido: ${response.data.t2_codigo}`,
      );
      console.log(`👤 Estudiante: ${response.data.t1_nombres}`);
      console.log(`🏫 Escuela: ${response.data.t1_escuela}`);
      return true; // Indica éxito
    } else {
      console.log(`❌ Registro fallido con código: ${response.data.code}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error en solicitud ${attempt + 1}:`);

    if (error.response) {
      // La solicitud fue realizada y el servidor respondió con un código de estado
      console.error(`📋 Estado: ${error.response.status}`);
      console.error(`📝 Datos: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      // La solicitud fue realizada pero no se recibió respuesta
      console.error('📡 No se recibió respuesta del servidor');
    } else {
      // Error en la configuración de la solicitud
      console.error(`🔧 Error: ${error.message}`);
    }

    return false;
  }
}

// Función para enviar múltiples solicitudes con un intervalo
async function sendMultipleRequests() {
  console.log(`🔄 Iniciando proceso de envío de ${numRequests} solicitudes...`);
  console.log(
    `👤 Datos del estudiante - DNI: ${userData.dni}, Código: ${userData.code}`,
  );
  console.log(`⏱️ Intervalo entre solicitudes: ${interval}ms`);

  let successCount = 0;

  for (let i = 0; i < numRequests; i++) {
    const success = await sendRequest(i);
    if (success) successCount++;

    // Si tuvimos éxito, terminamos
    if (success) {
      console.log(
        `✅ Registro exitoso conseguido en el intento ${i + 1}. Deteniendo proceso.`,
      );
      break;
    }

    // Esperar el intervalo antes de la siguiente solicitud
    if (i < numRequests - 1) {
      console.log(
        `⏳ Esperando ${interval}ms antes de la siguiente solicitud...`,
      );
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  console.log(`\n📊 Resumen:`);
  console.log(`📬 Total de solicitudes enviadas: ${numRequests}`);
  console.log(`✅ Solicitudes exitosas: ${successCount}`);
  console.log(`❌ Solicitudes fallidas: ${numRequests - successCount}`);
}

// Ejecutar el script
console.log('🏁 Iniciando script de registro de comedor UNCP');
sendMultipleRequests()
  .then(() => console.log('✅ Proceso completado'))
  .catch((err) =>
    console.error(`❌ Error general en el proceso: ${err.message}`),
  );
