import { z } from 'zod';

export const CreateTaskSchema = z.object({
    titulo: z.string().min(1, 'Título requerido'),
    descripcion: z.string().optional(),
    prioridad: z.enum(['alta', 'media', 'baja']).default('media'),
    asignado_a: z.string().optional(),
    fecha_limite: z.string().optional(),
});

export const UpdateTaskSchema = CreateTaskSchema.extend({
    id: z.number(),
    estado: z.enum(['pendiente', 'en_progreso', 'completada']).optional(),
});

export const FilterTasksSchema = z.object({
    estado: z.string().optional(),
    prioridad: z.string().optional(),
    asignado_a: z.string().optional(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type FilterTasksInput = z.infer<typeof FilterTasksSchema>;