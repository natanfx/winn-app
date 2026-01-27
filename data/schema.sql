-- db/schema.sql - Definición de la base de datos SQLite

-- Tabla de cuestionarios
CREATE TABLE IF NOT EXISTS cuestionarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    tiempo_limite INTEGER NOT NULL DEFAULT 30
);

-- Tabla de preguntas
CREATE TABLE IF NOT EXISTS preguntas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cuestionario_id INTEGER NOT NULL,
    enunciado TEXT NOT NULL,
    FOREIGN KEY (cuestionario_id) REFERENCES cuestionarios(id) ON DELETE CASCADE
);

-- Tabla de respuestas
CREATE TABLE IF NOT EXISTS respuestas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pregunta_id INTEGER NOT NULL,
    respuesta TEXT NOT NULL,
    es_correcta INTEGER NOT NULL CHECK (es_correcta IN (0,1)),
    FOREIGN KEY (pregunta_id) REFERENCES preguntas(id) ON DELETE CASCADE,
    UNIQUE (pregunta_id, respuesta) -- 🔹 Restricción UNIQUE para evitar respuestas duplicadas
);

-- Tabla de aplicaciones (intentos de cuestionarios)
CREATE TABLE IF NOT EXISTS aplicaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cuestionario_id INTEGER NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cuestionario_id) REFERENCES cuestionarios(id) ON DELETE CASCADE
);

-- Tabla de estudiantes
CREATE TABLE IF NOT EXISTS estudiantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    boleta TEXT NOT NULL UNIQUE,
    nickname TEXT NOT NULL
);

-- Tabla de respuestas de los estudiantes
CREATE TABLE IF NOT EXISTS respuestas_estudiantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aplicacion_id INTEGER NOT NULL,
    estudiante_id INTEGER NOT NULL,
    pregunta_id INTEGER NOT NULL,
    respuesta_id INTEGER NOT NULL,
    tiempo_respuesta INTEGER NOT NULL,
    FOREIGN KEY (aplicacion_id) REFERENCES aplicaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (estudiante_id) REFERENCES estudiantes(id) ON DELETE CASCADE,
    FOREIGN KEY (pregunta_id) REFERENCES preguntas(id) ON DELETE CASCADE,
    FOREIGN KEY (respuesta_id) REFERENCES respuestas(id) ON DELETE CASCADE
);

-- 📌 Datos iniciales 📌 --

-- Insertar cuestionarios
INSERT INTO cuestionarios (titulo, tiempo_limite) VALUES 
('Matemáticas Básicas', 30),
('Historia Universal', 45),
('Ciencia y Tecnología', 60);

-- Insertar preguntas para cada cuestionario
INSERT INTO preguntas (cuestionario_id, enunciado) VALUES 
(1, '¿Cuánto es 2 + 2?'),
(1, '¿Cuál es la raíz cuadrada de 16?'),
(1, '¿Cuánto es 10 dividido entre 2?'),
(1, '¿Qué número sigue en la secuencia 2, 4, 6, 8?'),
(1, '¿Cuánto es 3 x 3?'),

(2, '¿Quién descubrió América?'),
(2, '¿En qué año terminó la Segunda Guerra Mundial?'),
(2, '¿Quién fue el primer presidente de los Estados Unidos?'),
(2, '¿Qué civilización construyó las pirámides de Egipto?'),
(2, '¿Qué tratado puso fin a la Primera Guerra Mundial?'),

(3, '¿Cuál es la velocidad de la luz en el vacío?'),
(3, '¿Quién formuló la teoría de la relatividad?'),
(3, '¿Qué planeta es conocido como el planeta rojo?'),
(3, '¿Cuál es el elemento químico más abundante en el universo?'),
(3, '¿Qué invento revolucionó la comunicación en el siglo XIX?');

-- Insertar respuestas para cada pregunta
INSERT INTO respuestas (pregunta_id, respuesta, es_correcta) VALUES
(1, '4', 1), (1, '3', 0), (1, '5', 0), (1, '6', 0),
(2, '4', 1), (2, '5', 0), (2, '6', 0), (2, '8', 0),
(3, '5', 0), (3, '10', 1), (3, '20', 0), (3, '30', 0),
(4, '8', 0), (4, '10', 1), (4, '12', 0), (4, '14', 0),
(5, '6', 0), (5, '8', 0), (5, '9', 1), (5, '12', 0),

(6, 'Cristóbal Colón', 1), (6, 'Hernán Cortés', 0), (6, 'Simón Bolívar', 0), (6, 'Francisco Pizarro', 0),
(7, '1945', 1), (7, '1918', 0), (7, '1939', 0), (7, '1965', 0),
(8, 'George Washington', 1), (8, 'Abraham Lincoln', 0), (8, 'Thomas Jefferson', 0), (8, 'Benjamin Franklin', 0),
(9, 'Egipcios', 1), (9, 'Mayas', 0), (9, 'Aztecas', 0), (9, 'Romanos', 0),
(10, 'Tratado de Versalles', 1), (10, 'Tratado de París', 0), (10, 'Pacto de Varsovia', 0), (10, 'Tratado de Ginebra', 0),

(11, '299,792,458 m/s', 1), (11, '150,000,000 m/s', 0), (11, '100,000,000 m/s', 0), (11, '3,000,000 m/s', 0),
(12, 'Albert Einstein', 1), (12, 'Isaac Newton', 0), (12, 'Galileo Galilei', 0), (12, 'Nikola Tesla', 0),
(13, 'Marte', 1), (13, 'Júpiter', 0), (13, 'Venus', 0), (13, 'Saturno', 0),
(14, 'Hidrógeno', 1), (14, 'Oxígeno', 0), (14, 'Helio', 0), (14, 'Carbono', 0),
(15, 'Telégrafo', 1), (15, 'Teléfono', 0), (15, 'Radio', 0), (15, 'Televisión', 0);

-- Insertar intentos de cuestionarios
INSERT INTO aplicaciones (cuestionario_id) VALUES
(1), (1), (2), (2), (3);

-- Insertar estudiantes
INSERT INTO estudiantes (boleta, nickname) VALUES
('20230001', 'Juan'),
('20230002', 'María'),
('20230003', 'Carlos'),
('20230004', 'Ana'),
('20230005', 'Luis');

-- Insertar respuestas de los estudiantes en aplicaciones
INSERT INTO respuestas_estudiantes (aplicacion_id, estudiante_id, pregunta_id, respuesta_id, tiempo_respuesta) VALUES
(1, 1, 1, 1, 3),
(1, 2, 1, 2, 4),
(1, 3, 2, 5, 5),
(1, 4, 2, 6, 2),
(1, 5, 3, 9, 6);
