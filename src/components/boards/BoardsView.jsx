import { useState } from 'react'
import BoardView from './BoardView.jsx'
import { BOARDS, BOARD_AREAS } from '../../lib/boards'

// «Tableros» de la ceo y de Directivo: el tablero de cada área, con un selector de área. La ceo
// edita todo; Directivo ve y comenta. asId + readOnly: «Ver como».
export default function BoardsView({ client, me, zone, asId = null, readOnly = false }) {
  const [area, setArea] = useState(BOARD_AREAS[0])
  const isCeo = me.role === 'ceo'
  return (
    <div className="bd-boards">
      <div className="bd-boards-picker" role="group" aria-label="Área">
        <label>
          <span>Tablero</span>
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            {BOARD_AREAS.map((id) => (
              <option key={id} value={id}>
                {BOARDS[id].title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <BoardView key={area} client={client} area={area} meId={me.id} zone={zone} asId={asId} readOnly={readOnly} canEdit={isCeo} canComment />
    </div>
  )
}
