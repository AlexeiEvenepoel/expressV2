# Sistema de Registro de Tickets - Documentación Completa

## 🚀 Nuevas Funcionalidades Implementadas

He implementado un sistema completo de optimización para el registro de tickets con múltiples estrategias de velocidad y eficiencia.

## 📋 Endpoints Disponibles

### 1. Registro Simple

- **URL**: `POST /tickets/register`
- **Uso**: Registro básico de un ticket
- **Velocidad**: ⭐⭐

```json
{
  "dni": "73740592",
  "code": "2021101380G"
}
```

### 2. Registro Manual (Secuencial)

- **URL**: `POST /tickets/manual/:userId`
- **Uso**: Múltiples intentos secuenciales para un usuario registrado
- **Velocidad**: ⭐⭐⭐
- **Configuración**: Usa `DEFAULT_REQUESTS` y `DEFAULT_INTERVAL_MS` del .env

### 3. Registro Paralelo (NUEVO) ⚡

- **URL**: `POST /tickets/parallel/:userId`
- **Uso**: Envía múltiples solicitudes simultáneamente
- **Velocidad**: ⭐⭐⭐⭐⭐
- **Ventaja**: Máxima velocidad, todas las solicitudes al mismo tiempo

### 4. Registro Fast/Carrera (NUEVO) 🏃‍♂️

- **URL**: `POST /tickets/fast/:userId`
- **Uso**: Sistema de carrera - devuelve el primer éxito
- **Velocidad**: ⭐⭐⭐⭐⭐
- **Ventaja**: Se detiene tan pronto como una solicitud tiene éxito

### 5. Registro Masivo (NUEVO) 📦

- **URL**: `POST /tickets/batch-register`
- **Uso**: Registra tickets para múltiples usuarios simultáneamente
- **Velocidad**: ⭐⭐⭐⭐

```json
{
  "userIds": [1, 2, 3, 4, 5]
}
```

### 6. Estado del Sistema (NUEVO) 📊

- **URL**: `GET /tickets/status`
- **Uso**: Obtiene información del worker pool y configuración

### 7. Programación Mejorada

- **URL**: `POST /tickets/schedule/:userId`
- **Uso**: Ahora usa registro paralelo para programaciones
- **Ventaja**: Máxima eficiencia en horarios críticos (10:00 AM)

## 🔧 Sistema de Worker Pool

### Características:

- **Control de concurrencia**: Máximo 10 solicitudes simultáneas
- **Cola inteligente**: Las solicitudes esperan si el pool está lleno
- **Balanceador de carga**: Distribuye las solicitudes eficientemente

### Configuración en .env:

```
DEFAULT_REQUESTS=10          # Número de intentos por sesión
DEFAULT_INTERVAL_MS=50       # Intervalo entre intentos (solo para secuencial)
```

## 🌐 WebSocket en Tiempo Real (NUEVO)

### Eventos disponibles:

- `registerTicket`: Registro simple via WebSocket
- `parallelRegister`: Registro paralelo via WebSocket

### Eventos que recibes:

- `registerStatus`: Estados en tiempo real
- `registerResult`: Resultados de registros
- `registerError`: Errores
- `parallelResults`: Resultados de registros paralelos
- `globalStatus`: Actualizaciones globales del sistema

## 🎯 Estrategias Recomendadas

### Para uso normal (práctica):

```bash
POST /tickets/manual/1
```

### Para máxima velocidad (horario crítico 10:00 AM):

```bash
POST /tickets/parallel/1
```

### Para obtener el primer éxito rápidamente:

```bash
POST /tickets/fast/1
```

### Para múltiples usuarios (administradores):

```bash
POST /tickets/batch-register
{"userIds": [1,2,3,4,5]}
```

### Para programar automáticamente:

```bash
POST /tickets/schedule/1
{"time": "10:00"}
```

## 📱 Cliente de Prueba

He creado un cliente web completo en `/public/test-client.html` que te permite:

1. **Probar todos los endpoints REST**
2. **Conectarte via WebSocket**
3. **Ver logs en tiempo real**
4. **Comparar velocidades**

### Para acceder al cliente:

```
http://localhost:3000/public/test-client.html
```

## ⚡ Optimizaciones Implementadas

### 1. **FormData + Referer**

- Uso correcto del formato que espera la API
- Headers de referer para pasar validaciones

### 2. **Worker Pool**

- Control de concurrencia para evitar saturar el servidor
- Cola inteligente que gestiona las solicitudes

### 3. **Múltiples Estrategias**

- **Secuencial**: Para conservar recursos
- **Paralelo**: Para máxima velocidad
- **Carrera**: Para primer éxito rápido
- **Masivo**: Para múltiples usuarios

### 4. **WebSocket**

- Comunicación bidireccional en tiempo real
- Notificaciones instantáneas de estado
- Perfecto para interfaces de usuario dinámicas

### 5. **Reintentos Inteligentes**

- Backoff exponencial para reintentos
- Detección automática de éxitos
- Manejo de errores robusto

## 🔥 Flujo de Trabajo Recomendado

### 1. Configuración inicial:

```bash
# Crear usuario
POST /users
{
  "name": "Tu Nombre",
  "dni": "73740592",
  "code": "2021101380G"
}
```

### 2. Para tests normales:

```bash
POST /tickets/manual/1
```

### 3. Para horario crítico (10:00 AM):

```bash
POST /tickets/parallel/1
```

### 4. Para programar automáticamente:

```bash
POST /tickets/schedule/1
{"time": "09:59"}  # Un minuto antes para estar preparado
```

### 5. Monitoreo del sistema:

```bash
GET /tickets/status
```

## 🎮 Cómo Manipular el Sistema

### Variables de Entorno Clave:

```env
DEFAULT_REQUESTS=10          # Más intentos = más chances
DEFAULT_INTERVAL_MS=50       # Solo para secuencial
```

### Endpoints por Velocidad (más rápido a más lento):

1. `POST /tickets/fast/:userId` (Carrera - primer éxito)
2. `POST /tickets/parallel/:userId` (Paralelo - todos simultáneos)
3. `POST /tickets/manual/:userId` (Secuencial con intervalos)
4. `POST /tickets/register` (Simple - un intento)

### Monitoreo en Tiempo Real:

- Usa WebSocket para ver exactamente qué está pasando
- El cliente de test te muestra todos los eventos
- Logs detallados en consola del servidor

## 🚨 Uso en Producción

### Para el día del comedor (10:00 AM):

1. **Programar con anticipación**:

   ```bash
   POST /tickets/schedule/1 {"time": "09:59"}
   ```

2. **Backup manual si es necesario**:

   ```bash
   POST /tickets/fast/1
   ```

3. **Monitor en tiempo real**:
   - Abre el cliente WebSocket
   - Observa los eventos en vivo

Con estas implementaciones, tienes un sistema robusto, rápido y escalable para obtener tickets de comedor. El sistema ahora puede manejar múltiples estrategias simultáneamente y te da máximas posibilidades de éxito.
