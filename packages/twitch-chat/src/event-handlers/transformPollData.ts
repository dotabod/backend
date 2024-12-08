export const transformPollData = (data: any) => ({
  choices: data.choices.map((choice: any) => {
    const hasVotes = 'total_votes' in choice
    return {
      totalVotes: hasVotes ? choice.total_votes : 0,
      title: choice.title,
    }
  }),
  title: data.title,
  endDate: 'end_date' in data ? new Date(data.end_date) : '',
})
