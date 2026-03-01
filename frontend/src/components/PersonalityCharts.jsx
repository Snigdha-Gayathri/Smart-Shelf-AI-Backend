import React, { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-basic-dist'

export function GenreBarChart({ data, theme = 'light' }) {
  const chartRef = useRef(null)

  useEffect(() => {
    if (!data || Object.keys(data).length === 0 || !chartRef.current) return

    const genres = Object.keys(data)
    const scores = Object.values(data)

    const chartData = [{
      x: genres,
      y: scores,
      type: 'bar',
      marker: {
        color: scores.map((_, i) => {
          const colors = ['#3b82f6', '#1E90FF', '#ec4899', '#f59e0b', '#10b981']
          return colors[i % colors.length]
        }),
        line: {
          width: 2,
          color: theme === 'dark' ? '#1e293b' : '#fff'
        }
      },
      text: scores.map(s => `${s}%`),
      textposition: 'outside',
      textfont: {
        color: theme === 'dark' ? '#e2e8f0' : '#334155'
      }
    }]

    const layout = {
      title: {
        text: 'Genre Affinity Score',
        font: { color: theme === 'dark' ? '#e2e8f0' : '#334155', size: 16 }
      },
      xaxis: {
        tickfont: { color: theme === 'dark' ? '#94a3b8' : '#64748b' },
        gridcolor: theme === 'dark' ? '#334155' : '#e2e8f0'
      },
      yaxis: {
        title: 'Affinity %',
        tickfont: { color: theme === 'dark' ? '#94a3b8' : '#64748b' },
        gridcolor: theme === 'dark' ? '#334155' : '#e2e8f0',
        range: [0, 100]
      },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      margin: { t: 50, b: 60, l: 60, r: 20 }
    }

    Plotly.newPlot(chartRef.current, chartData, layout, { responsive: true })

    return () => {
      if (chartRef.current) {
        Plotly.purge(chartRef.current)
      }
    }
  }, [data, theme])

  return <div ref={chartRef} style={{ width: '100%', minHeight: 300 }} />
}

export function MoodPieChart({ data, theme = 'light' }) {
  const chartRef = useRef(null)

  useEffect(() => {
    if (!data || Object.keys(data).length === 0 || !chartRef.current) return

    const moods = Object.keys(data)
    const percentages = Object.values(data)

    const colors = [
      '#3b82f6', '#1E90FF', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'
    ]

    const chartData = [{
      labels: moods,
      values: percentages,
      type: 'pie',
      hole: 0.4,
      marker: {
        colors: colors.slice(0, moods.length),
        line: {
          color: theme === 'dark' ? '#0f172a' : '#fff',
          width: 2
        }
      },
      textinfo: 'label+percent',
      textfont: {
        color: '#fff',
        size: 14
      },
      hoverinfo: 'label+value+percent'
    }]

    const layout = {
      title: {
        text: 'Mood Distribution',
        font: { color: theme === 'dark' ? '#e2e8f0' : '#334155', size: 16 }
      },
      paper_bgcolor: 'transparent',
      showlegend: true,
      legend: {
        font: { color: theme === 'dark' ? '#94a3b8' : '#64748b' }
      },
      margin: { t: 50, b: 40, l: 40, r: 40 }
    }

    Plotly.newPlot(chartRef.current, chartData, layout, { responsive: true })

    return () => {
      if (chartRef.current) {
        Plotly.purge(chartRef.current)
      }
    }
  }, [data, theme])

  return <div ref={chartRef} style={{ width: '100%', minHeight: 350 }} />
}

export function TropeHorizontalBarChart({ data, theme = 'light' }) {
  const chartRef = useRef(null)

  useEffect(() => {
    if (!data || Object.keys(data).length === 0 || !chartRef.current) return

    const tropes = Object.keys(data).slice(0, 10)
    const counts = Object.values(data).slice(0, 10)

    const chartData = [{
      y: tropes.reverse(),
      x: counts.reverse(),
      type: 'bar',
      orientation: 'h',
      marker: {
        color: '#3b82f6',
        line: {
          color: theme === 'dark' ? '#1e293b' : '#fff',
          width: 1
        }
      },
      text: counts.reverse().map(c => `×${c}`),
      textposition: 'outside',
      textfont: {
        color: theme === 'dark' ? '#e2e8f0' : '#334155'
      }
    }]

    const layout = {
      title: {
        text: 'Most Frequent Tropes',
        font: { color: theme === 'dark' ? '#e2e8f0' : '#334155', size: 16 }
      },
      xaxis: {
        title: 'Frequency',
        tickfont: { color: theme === 'dark' ? '#94a3b8' : '#64748b' },
        gridcolor: theme === 'dark' ? '#334155' : '#e2e8f0'
      },
      yaxis: {
        tickfont: { color: theme === 'dark' ? '#94a3b8' : '#64748b', size: 11 },
        automargin: true
      },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      margin: { t: 50, b: 60, l: 150, r: 60 }
    }

    Plotly.newPlot(chartRef.current, chartData, layout, { responsive: true })

    return () => {
      if (chartRef.current) {
        Plotly.purge(chartRef.current)
      }
    }
  }, [data, theme])

  return <div ref={chartRef} style={{ width: '100%', minHeight: 400 }} />
}
