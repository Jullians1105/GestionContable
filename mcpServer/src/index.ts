import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from '@modelcontextprotocol/sdk/types.js';
import * as tools from './tools';
import { CreateTaskSchema, UpdateTaskSchema, FilterTasksSchema } from './schemas';
import { closeDb } from './database';

const server = new Server(
    {
    name: 'gestor-tareas-sqlite',
    version: '1.0.0',
    },
    {
    capabilities: {
        tools: {}
    }
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: toolDefinitions };
});

const toolDefinitions: Tool[] = [
    {
        name: 'create_task',
        description: 'Crear una nueva tarea',
        inputSchema: {
            type: 'object' as const,
            properties: {
                titulo: { type: 'string', description: 'Título de la tarea' },
                descripcion: { type: 'string', description: 'Descripción de la tarea' },
                prioridad: { type: 'string', enum: ['alta', 'media', 'baja'], description: 'Nivel de prioridad' },
                asignado_a: { type: 'string', description: 'Nombre del empleado asignado' },
                fecha_limite: { type: 'string', description: 'Fecha límite (YYYY-MM-DD)' },
            },
            required: ['titulo'],
        },
    },
    {
        name: 'get_tasks',
        description: 'Obtener tareas con filtros opcionales',
        inputSchema: {
            type: 'object' as const,
            properties: {
                estado: { type: 'string', description: 'Filtrar por estado: pendiente, en_progreso, completada' },
                prioridad: { type: 'string', description: 'Filtrar por prioridad: alta, media, baja' },
                asignado_a: { type: 'string', description: 'Filtrar por empleado asignado' },
            },
        },
    },
    {
        name: 'get_task',
        description: 'Obtener una tarea por ID',
        inputSchema: {
            type: 'object' as const,
            properties: {
                id: { type: 'number', description: 'ID de la tarea' },
            },
            required: ['id'],
        },
    },
    {
        name: 'update_task',
        description: 'Actualizar una tarea existente',
        inputSchema: {
            type: 'object' as const,
            properties: {
                id: { type: 'number', description: 'ID de la tarea' },
                titulo: { type: 'string', description: 'Nuevo título' },
                descripcion: { type: 'string', description: 'Nueva descripción' },
                estado: { type: 'string', enum: ['pendiente', 'en_progreso', 'completada'] },
                prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
                asignado_a: { type: 'string' },
                fecha_limite: { type: 'string' },
            },
            required: ['id', 'titulo'],
        },
    },
    {
        name: 'delete_task',
        description: 'Eliminar una tarea',
        inputSchema: {
            type: 'object' as const,
            properties: {
                id: { type: 'number', description: 'ID de la tarea a eliminar' },
            },
            required: ['id'],
        },
    },
    {
        name: 'get_employees',
        description: 'Obtener lista de empleados activos',
        inputSchema: {
            type: 'object' as const,
            properties: {},
        },
    },
    {
        name: 'get_task_stats',
        description: 'Obtener estadísticas de tareas',
        inputSchema: {
            type: 'object' as const,
            properties: {},
        },
    },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: toolDefinitions };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const safeArgs = (args ?? {}) as Record<string, unknown>;

    try {
        let result;

        switch (name) {
            case 'create_task': {
                const input = CreateTaskSchema.parse(safeArgs);
                result = await tools.createTask(input);
                break;
            }
            case 'get_tasks': {
                const filters = FilterTasksSchema.parse(safeArgs);
                result = await tools.getTasks(filters);
                break;
            }
            case 'get_task': {
                result = await tools.getTaskById(safeArgs.id as number);
                break;
            }
            case 'update_task': {
                const input = UpdateTaskSchema.parse(safeArgs);
                result = await tools.updateTask(input);
                break;
            }
            case 'delete_task': {
                result = await tools.deleteTask(safeArgs.id as number);
                break;
            }
            case 'get_employees': {
                result = await tools.getEmployees();
                break;
            }
            case 'get_task_stats': {
                result = await tools.getTaskStats();
                break;
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }

        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    } catch (error) {
        return {
            content: [
                {
                    type: 'text' as const,
                    text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Gestor de Tareas MCP Server running...');
}

process.on('SIGINT', () => {
    closeDb();
    process.exit(0);
});

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
