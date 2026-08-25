export default function ExogenasUploadPage() {
  return (
    <div className="max-w-[600px] mx-auto mt-12">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-3xl text-[#004ac6]">request_quote</span>
          <h1 className="text-2xl font-bold text-[#191c1e] dark:text-[#e4e6f0]">
            Exógenas
          </h1>
        </div>
        <p className="text-sm text-[#6b7280] dark:text-[#8890b5]">
          Generación de reportes de Información Exógena DIAN a partir de plantillas SIIGO.
        </p>
      </div>

      <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-[#e2e4ef] dark:border-[#2e3148] shadow-sm p-8">
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="w-14 h-14 rounded-full bg-[#e8f0fe] dark:bg-[#1a2550] flex items-center justify-center">
            <span className="material-symbols-outlined text-3xl text-[#004ac6]">construction</span>
          </div>
          <p className="text-sm font-semibold text-[#191c1e] dark:text-[#e4e6f0]">
            Próximamente
          </p>
          <p className="text-xs text-[#9ca3af] dark:text-[#6b7280] max-w-xs">
            Este módulo está en construcción. Pronto podrás generar aquí los formatos 1005, 1001, 1006 y 1007.
          </p>
        </div>
      </div>
    </div>
  )
}
