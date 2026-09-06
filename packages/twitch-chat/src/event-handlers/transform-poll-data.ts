interface PollChoice {
  id?: string
  title: string
  votes?: number
  channel_points_votes?: number
  bits_votes?: number
}

interface PollEvent {
  id?: string
  title: string
  choices: PollChoice[]
  started_at?: string
  ends_at?: string
  ended_at?: string
}

export const transformPollData = (data: PollEvent) => {
  const endDateStr = data.ends_at ?? data.ended_at
  return {
    choices: data.choices.map((choice) => ({
      title: choice.title,
      totalVotes: choice.votes ?? 0,
    })),
    endDate: endDateStr !== undefined && endDateStr.length > 0 ? new Date(endDateStr) : '',
    title: data.title,
  }
}
