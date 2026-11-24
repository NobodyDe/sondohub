export type Previsao = {
  local: string
  agora: { temperatura: number; sensacao: number; codigo: number }
  dias: { data: string; min: number; max: number; chuva: number; codigo: number }[]
}

const WMO: [number[], string][] = [
  [[0], 'céu limpo'],
  [[1, 2], 'poucas nuvens'],
  [[3], 'nublado'],
  [[45, 48], 'neblina'],
  [[51, 53, 55, 56, 57], 'garoa'],
  [[61, 63, 65, 66, 67], 'chuva'],
  [[71, 73, 75, 77, 85, 86], 'neve'],
  [[80, 81, 82], 'pancadas de chuva'],
  [[95, 96, 99], 'tempestade com raios'],
]

export function descreverClima(codigo: number): string {
  return WMO.find(([codigos]) => codigos.includes(codigo))?.[1] ?? 'tempo variável'
}

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

function nomeDia(data: string, indice: number): string {
  if (indice === 0) return 'hoje'
  if (indice === 1) return 'amanhã'
  // data = AAAA-MM-DD; meio-dia UTC evita virar o dia por fuso.
  return DIAS[new Date(`${data}T12:00:00Z`).getUTCDay()]
}

export function formatarPrevisao(p: Previsao): string {
  const linhas = [
    `Previsão para ${p.local}.`,
    `Agora: ${Math.round(p.agora.temperatura)}°C (sensação ${Math.round(p.agora.sensacao)}°C), ${descreverClima(p.agora.codigo)}.`,
  ]
  p.dias.forEach((d, i) => {
    linhas.push(
      `${nomeDia(d.data, i)}: mínima ${Math.round(d.min)}°C, máxima ${Math.round(d.max)}°C, ${descreverClima(d.codigo)}, chance de chuva ${Math.round(d.chuva)}%.`,
    )
  })
  return linhas.join('\n')
}

type Geo = { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone?: string }[] }
type Prev = {
  current: { temperature_2m: number; apparent_temperature: number; weather_code: number }
  daily: {
    time: string[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: number[]
    weather_code: number[]
  }
}

/** Previsão via Open-Meteo (sem chave). Nunca lança. */
export async function previsaoDoTempo(cidade: string): Promise<string> {
  const nome = cidade.trim().slice(0, 100)
  if (!nome) return 'Informe a cidade.'
  try {
    const geo = (await (
      await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=1&language=pt`,
        { signal: AbortSignal.timeout(6000) },
      )
    ).json()) as Geo
    const lugar = geo.results?.[0]
    if (!lugar) return `Não encontrei a cidade "${nome}".`
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${lugar.latitude}&longitude=${lugar.longitude}` +
      '&current=temperature_2m,apparent_temperature,weather_code' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
      `&timezone=${encodeURIComponent(lugar.timezone ?? 'auto')}&forecast_days=3`
    const prev = (await (await fetch(url, { signal: AbortSignal.timeout(6000) })).json()) as Prev
    return formatarPrevisao({
      local: [lugar.name, lugar.admin1].filter(Boolean).join(', '),
      agora: {
        temperatura: prev.current.temperature_2m,
        sensacao: prev.current.apparent_temperature,
        codigo: prev.current.weather_code,
      },
      dias: prev.daily.time.map((data, i) => ({
        data,
        min: prev.daily.temperature_2m_min[i],
        max: prev.daily.temperature_2m_max[i],
        chuva: prev.daily.precipitation_probability_max[i] ?? 0,
        codigo: prev.daily.weather_code[i],
      })),
    })
  } catch {
    return 'Não consegui consultar a previsão agora. Diga que não conseguiu.'
  }
}
