interface PollChoice {
  title: string
  total_votes?: number
}

interface PollEvent {
  title: string
  choices: PollChoice[]
  end_date?: string
}

export const transformPollData = (data: PollEvent) => ({
  choices: data.choices.map((choice) => {
    const hasVotes = 'total_votes' in choice
    return {
      totalVotes: hasVotes ? choice.total_votes : 0,
      title: choice.title,
    }
  }),
  title: data.title,
  endDate: 'end_date' in data ? new Date(data.end_date as string) : '',
})
