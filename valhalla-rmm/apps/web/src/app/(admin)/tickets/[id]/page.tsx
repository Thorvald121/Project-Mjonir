export default function TicketDetailPage({ params }: { params: { id: string } }) {
  return (
    <div style={{ padding: 40, color: 'white' }}>
      <p>Route is working</p>
      <p>ID: {params.id}</p>
    </div>
  )
}